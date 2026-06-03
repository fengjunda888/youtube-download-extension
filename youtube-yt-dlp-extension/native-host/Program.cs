using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

static readonly string DefaultDownloadDir = Path.Combine(
  Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
  "youtube videos"
);

var tasks = new ConcurrentDictionary<string, DownloadTask>();
var input = Console.OpenStandardInput();
var output = Console.OpenStandardOutput();
var outputLock = new object();

while (true)
{
  var message = ReadMessage(input);
  if (message is null)
  {
    break;
  }

  try
  {
    var root = JsonDocument.Parse(message).RootElement;
    var action = root.GetProperty("action").GetString() ?? "";
    var requestId = root.TryGetProperty("requestId", out var requestIdProp) ? requestIdProp.GetString() : null;

    switch (action)
    {
      case "start":
        WriteResponse(output, outputLock, WithRequestId(requestId, StartDownload(root, tasks)));
        break;
      case "list":
        WriteResponse(output, outputLock, WithRequestId(requestId, new { ok = true, tasks = tasks.Values.OrderByDescending(t => t.StartedAt).ToArray() }));
        break;
      case "cancel":
        WriteResponse(output, outputLock, WithRequestId(requestId, CancelDownload(root, tasks)));
        break;
      default:
        WriteResponse(output, outputLock, WithRequestId(requestId, new { ok = false, error = "Unknown action." }));
        break;
    }
  }
  catch (Exception ex)
  {
    WriteResponse(output, outputLock, new { ok = false, error = ex.Message });
  }
}

static object StartDownload(JsonElement root, ConcurrentDictionary<string, DownloadTask> tasks)
{
  var url = root.GetProperty("url").GetString() ?? "";
  if (!IsYouTubeUrl(url))
  {
    return new { ok = false, error = "Only YouTube URLs are supported." };
  }

  var downloadDir = root.TryGetProperty("downloadDir", out var dirProp) ? dirProp.GetString() : null;
  var playlistMode = root.TryGetProperty("playlistMode", out var playlistProp) ? playlistProp.GetString() : "single";
  var quality = root.TryGetProperty("quality", out var qualityProp) ? qualityProp.GetString() : "best-mp4";
  var targetDir = ResolveDownloadDir(downloadDir);
  var logDir = Path.Combine(targetDir, "yt-dlp-logs");
  Directory.CreateDirectory(logDir);

  var id = DateTimeOffset.Now.ToUnixTimeMilliseconds().ToString();
  var logFile = Path.Combine(logDir, $"download-{id}.log");
  var outputTemplate = Path.Combine(targetDir, "%(playlist_index&{} - |)s%(title).120B [%(id)s].%(ext)s");
  var task = new DownloadTask
  {
    Id = id,
    Url = url,
    DownloadDir = targetDir,
    Quality = quality ?? "best-mp4",
    PlaylistMode = playlistMode ?? "single",
    LogFile = logFile,
    Status = "starting",
    StartedAt = DateTimeOffset.Now
  };
  tasks[id] = task;

  var args = BuildYtDlpArgs(url, outputTemplate, task.Quality, task.PlaylistMode);
  var psi = new ProcessStartInfo
  {
    FileName = ResolveYtDlpPath(),
    WorkingDirectory = targetDir,
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
    CreateNoWindow = true
  };
  foreach (var arg in args)
  {
    psi.ArgumentList.Add(arg);
  }

  try
  {
    var process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start yt-dlp.");
    task.ProcessId = process.Id;
    task.Status = "running";
    _ = PumpProcessAsync(process, task);
    return new { ok = true, task };
  }
  catch (Exception ex)
  {
    task.Status = "error";
    task.Message = ex.Message;
    return new { ok = false, error = ex.Message, task };
  }
}

static object WithRequestId(string? requestId, object payload)
{
  var json = JsonSerializer.SerializeToElement(payload);
  using var doc = JsonDocument.Parse(json.GetRawText());
  var map = new Dictionary<string, object?> { ["requestId"] = requestId };
  foreach (var prop in doc.RootElement.EnumerateObject())
  {
    map[prop.Name] = prop.Value.Clone();
  }
  return map;
}

static object CancelDownload(JsonElement root, ConcurrentDictionary<string, DownloadTask> tasks)
{
  var id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
  if (string.IsNullOrWhiteSpace(id) || !tasks.TryGetValue(id, out var task))
  {
    return new { ok = false, error = "Task not found." };
  }

  try
  {
    if (task.ProcessId is int pid)
    {
      Process.GetProcessById(pid).Kill(entireProcessTree: true);
    }
    task.Status = "canceled";
    task.Message = "Canceled";
    return new { ok = true, task };
  }
  catch (Exception ex)
  {
    return new { ok = false, error = ex.Message, task };
  }
}

static async Task PumpProcessAsync(Process process, DownloadTask task)
{
  await using var logStream = new FileStream(task.LogFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
  await using var writer = new StreamWriter(logStream, Encoding.UTF8) { AutoFlush = true };

  process.OutputDataReceived += (_, e) => HandleYtDlpLine(e.Data, task, writer);
  process.ErrorDataReceived += (_, e) => HandleYtDlpLine(e.Data, task, writer);
  process.BeginOutputReadLine();
  process.BeginErrorReadLine();
  await process.WaitForExitAsync();

  task.ExitCode = process.ExitCode;
  task.UpdatedAt = DateTimeOffset.Now;
  if (task.Status != "canceled")
  {
    task.Status = process.ExitCode == 0 ? "done" : "error";
    task.Message = process.ExitCode == 0 ? "Finished" : $"yt-dlp exited with code {process.ExitCode}";
  }
  await writer.WriteLineAsync($"exit_code={process.ExitCode}");
}

static void HandleYtDlpLine(string? line, DownloadTask task, StreamWriter writer)
{
  if (string.IsNullOrWhiteSpace(line))
  {
    return;
  }

  writer.WriteLine(line);
  task.LastLine = line;
  task.UpdatedAt = DateTimeOffset.Now;

  if (line.Contains("[download] Destination:", StringComparison.OrdinalIgnoreCase) ||
      line.Contains("[download] Resuming download", StringComparison.OrdinalIgnoreCase))
  {
    task.Status = "running";
    task.Message = line;
  }

  var percentMatch = Regex.Match(line, @"\[download\]\s+(?<pct>\d+(?:\.\d+)?)%");
  if (percentMatch.Success && double.TryParse(percentMatch.Groups["pct"].Value, out var percent))
  {
    task.Percent = percent;
    task.Status = "running";
  }

  var etaMatch = Regex.Match(line, @"ETA\s+(?<eta>[0-9:]+|Unknown)");
  if (etaMatch.Success)
  {
    task.Eta = etaMatch.Groups["eta"].Value;
  }

  var speedMatch = Regex.Match(line, @"at\s+(?<speed>\S+/s)");
  if (speedMatch.Success)
  {
    task.Speed = speedMatch.Groups["speed"].Value;
  }
}

static string[] BuildYtDlpArgs(string url, string outputTemplate, string quality, string playlistMode)
{
  var format = quality switch
  {
    "1080" => "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]",
    "720" => "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
    "480" => "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]",
    "audio" => "bestaudio/best",
    _ => "best[ext=mp4]/best"
  };

  var args = new List<string>
  {
    "--ignore-config",
    "--no-overwrites",
    "--newline",
    "--progress",
    "-f",
    format,
    "-o",
    outputTemplate
  };

  if (playlistMode != "playlist")
  {
    args.Add("--no-playlist");
  }
  else
  {
    args.Add("--yes-playlist");
  }

  if (quality == "audio")
  {
    args.Add("-x");
    args.Add("--audio-format");
    args.Add("mp3");
  }

  args.Add(url);
  return args.ToArray();
}

static bool IsYouTubeUrl(string value)
{
  try
  {
    var uri = new Uri(value);
    return uri.Host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "youtu.be";
  }
  catch
  {
    return false;
  }
}

static string ResolveDownloadDir(string? requestedDir)
{
  var dir = string.IsNullOrWhiteSpace(requestedDir) ? DefaultDownloadDir : requestedDir!;
  Directory.CreateDirectory(dir);
  return dir;
}

static string ResolveYtDlpPath()
{
  var envPath = Environment.GetEnvironmentVariable("YTDLP_PATH");
  if (!string.IsNullOrWhiteSpace(envPath) && File.Exists(envPath))
  {
    return envPath;
  }

  return "yt-dlp";
}

static string? ReadMessage(Stream stream)
{
  var lengthBytes = new byte[4];
  if (stream.Read(lengthBytes, 0, 4) != 4)
  {
    return null;
  }

  var length = BitConverter.ToInt32(lengthBytes, 0);
  var buffer = new byte[length];
  var read = 0;
  while (read < length)
  {
    var chunk = stream.Read(buffer, read, length - read);
    if (chunk <= 0)
    {
      break;
    }
    read += chunk;
  }
  return Encoding.UTF8.GetString(buffer, 0, read);
}

static void WriteResponse(Stream stream, object syncRoot, object payload)
{
  var json = JsonSerializer.Serialize(payload);
  var bytes = Encoding.UTF8.GetBytes(json);
  var lengthBytes = BitConverter.GetBytes(bytes.Length);
  lock (syncRoot)
  {
    stream.Write(lengthBytes, 0, lengthBytes.Length);
    stream.Write(bytes, 0, bytes.Length);
    stream.Flush();
  }
}

sealed class DownloadTask
{
  public string Id { get; set; } = "";
  public string Url { get; set; } = "";
  public string DownloadDir { get; set; } = "";
  public string Quality { get; set; } = "";
  public string PlaylistMode { get; set; } = "";
  public string LogFile { get; set; } = "";
  public string Status { get; set; } = "";
  public string Message { get; set; } = "";
  public string LastLine { get; set; } = "";
  public string Eta { get; set; } = "";
  public string Speed { get; set; } = "";
  public double Percent { get; set; }
  public int? ProcessId { get; set; }
  public int? ExitCode { get; set; }
  public DateTimeOffset StartedAt { get; set; }
  public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.Now;
}
