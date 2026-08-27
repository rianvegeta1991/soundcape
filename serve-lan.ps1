param(
    [int]$Port = 8794
)

# ============================================================
#  Soundcape – LAN-Server (fürs Handy im selben WLAN)
#  WICHTIG: PowerShell als Administrator starten!
#  (Rechtsklick auf PowerShell > "Als Administrator ausfuehren")
# ============================================================

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")   # lauscht auf allen Netzwerk-Adressen
try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  FEHLER: Server konnte nicht gestartet werden." -ForegroundColor Red
    Write-Host "  Bitte diese PowerShell ALS ADMINISTRATOR oeffnen und erneut ausfuehren." -ForegroundColor Yellow
    Write-Host "  (Startmenue > 'Windows PowerShell' > Rechtsklick > 'Als Administrator ausfuehren')" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Firewall-Regel automatisch anlegen (falls Adminrechte vorhanden)
try {
    if (-not (Get-NetFirewallRule -DisplayName "Soundcape $Port" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "Soundcape $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
        Write-Host "  Firewall-Regel fuer Port $Port angelegt." -ForegroundColor DarkGray
    }
} catch {
    Write-Host "  Hinweis: Firewall-Regel konnte nicht automatisch angelegt werden." -ForegroundColor DarkYellow
}

# LAN-IP ermitteln und anzeigen
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   Server laeuft!" -ForegroundColor Green
Write-Host "   Auf dem Handy (gleiches WLAN) oeffnen:" -ForegroundColor Green
Write-Host "      http://$ip`:$Port/" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   Beenden mit Strg + C" -ForegroundColor DarkGray
Write-Host ""

$mimeMap = @{
    ".html" = "text/html"
    ".htm"  = "text/html"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".webmanifest" = "application/manifest+json"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        try {
            $path = $request.Url.AbsolutePath
            if ($path -eq "/") { $path = "/index.html" }
            $filePath = Join-Path $root ($path.TrimStart("/"))
            $fullRoot = (Resolve-Path $root).Path
            if ((Test-Path $filePath) -and ((Resolve-Path $filePath).Path.StartsWith($fullRoot))) {
                $ext = [System.IO.Path]::GetExtension($filePath)
                $contentType = $mimeMap[$ext]
                if (-not $contentType) { $contentType = "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.OutputStream.Write($notFound, 0, $notFound.Length)
            }
        } catch {
            $response.StatusCode = 500
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
}

