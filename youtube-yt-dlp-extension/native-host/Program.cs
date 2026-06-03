using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

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
      case "resolve":
        WriteResponse(output, outputLock, WithRequestId(requestId, ResolveVideos(root)));
        break;
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

static object ResolveVideos(JsonElement root)
{
  var url = root.GetProperty("url").GetString() ?? "";
  if (!IsYouTubeUrl(url))
  {
    return new { ok = false, error = "Only YouTube URLs are supported." };
  }

  var psi = new ProcessStartInfo
  {
    FileName = ResolveYtDlpPath(),
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
    CreateNoWindow = true
  };

  foreach (var arg in new[]
  {
    "--ignore-config",
    "--dump-single-json",
    "--flat-playlist",
    "--skip-download",
    "--no-warnings",
    url
  })
  {
    psi.ArgumentList.Add(arg);
  }

  try
  {
    using var process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start yt-dlp.");
    var stdoutTask = process.StandardOutput.ReadToEndAsync();
    var stderrTask = process.StandardError.ReadToEndAsync();
    if (!process.WaitForExit(60000))
    {
      process.Kill(entireProcessTree: true);
      return new { ok = false, error = "Timed out while resolving the URL." };
    }

    var stdout = stdoutTask.GetAwaiter().GetResult();
    var stderr = stderrTask.GetAwaiter().GetResult();
    if (process.ExitCode != 0)
    {
      return new { ok = false, error = string.IsNullOrWhiteSpace(stderr) ? $"yt-dlp exited with code {process.ExitCode}" : stderr.Trim() };
    }

    using var doc = JsonDocument.Parse(stdout);
    var rootJson = doc.RootElement;
    var title = GetString(rootJson, "title");
    var sourceType = rootJson.TryGetProperty("entries", out var entries) && entries.ValueKind == JsonValueKind.Array ? "playlist" : "video";
    var videos = new List<ResolvedVideo>();

    if (sourceType == "playlist")
    {
      foreach (var entry in entries.EnumerateArray())
      {
        if (entry.ValueKind != JsonValueKind.Object)
        {
          continue;
        }
        var videoUrl = ResolveEntryUrl(entry);
        if (string.IsNullOrWhiteSpace(videoUrl))
        {
          continue;
        }
        videos.Add(new ResolvedVideo
        {
          Id = GetString(entry, "id") ?? "",
          Url = videoUrl,
          Title = GetString(entry, "title") ?? videoUrl,
          Uploader = GetString(entry, "uploader") ?? GetString(entry, "channel") ?? "",
          Duration = GetDuration(entry),
          Index = GetInt(entry, "playlist_index") ?? videos.Count + 1
        });
      }
    }
    else
    {
      videos.Add(new ResolvedVideo
      {
        Id = GetString(rootJson, "id") ?? "",
        Url = GetString(rootJson, "webpage_url") ?? url,
        Title = title ?? url,
        Uploader = GetString(rootJson, "uploader") ?? GetString(rootJson, "channel") ?? "",
        Duration = GetDuration(rootJson),
        Index = 1
      });
    }

    return new { ok = true, title = title ?? url, sourceType, count = videos.Count, videos };
  }
  catch (Exception ex)
  {
    return new { ok = false, error = ex.Message };
  }
}

static string? ResolveEntryUrl(JsonElement entry)
{
  var webpageUrl = GetString(entry, "webpage_url");
  if (!string.IsNullOrWhiteSpace(webpageUrl))
  {
    return webpageUrl;
  }

  var url = GetString(entry, "url");
  if (!string.IsNullOrWhiteSpace(url) && IsYouTubeUrl(url))
  {
    return url;
  }

  var id = GetString(entry, "id") ?? url;
  return string.IsNullOrWhiteSpace(id) ? null : $"https://www.youtube.com/watch?v={id}";
}

static string? GetString(JsonElement element, string name)
{
  return element.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String ? prop.GetString() : null;
}

static int? GetInt(JsonElement element, string name)
{
  return element.TryGetProperty(name, out var prop) && prop.TryGetInt32(out var value) ? value : null;
}

static string GetDuration(JsonElement element)
{
  if (!element.TryGetProperty("duration", out var prop))
  {
    return "";
  }

  double seconds;
  if (prop.ValueKind == JsonValueKind.Number && prop.TryGetDouble(out var number))
  {
    seconds = number;
  }
  else if (prop.ValueKind == JsonValueKind.String && double.TryParse(prop.GetString(), out var parsed))
  {
    seconds = parsed;
  }
  else
  {
    return "";
  }

  var time = TimeSpan.FromSeconds(seconds);
  return time.TotalHours >= 1 ? time.ToString(@"h\:mm\:ss") : time.ToString(@"m\:ss");
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
  var defaultDownloadDir = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
    "youtube videos"
  );
  var dir = string.IsNullOrWhiteSpace(requestedDir) ? defaultDownloadDir : requestedDir!;
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

sealed class ResolvedVideo
{
  public string Id { get; set; } = "";
  public string Url { get; set; } = "";
  public string Title { get; set; } = "";
  public string Uploader { get; set; } = "";
  public string Duration { get; set; } = "";
  public int Index { get; set; }
}
