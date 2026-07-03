$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $workspace ".env"

if (-not (Test-Path $target)) {
    Copy-Item (Join-Path $workspace ".env.example") $target
}

$secure = Read-Host "Nhap OpenAI API key (ky tu se duoc an)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    if ($plain -notmatch '^sk-[A-Za-z0-9_-]{20,}$') {
        throw "API key khong dung dinh dang. Khong co thay doi nao duoc luu."
    }
    $lines = [Collections.Generic.List[string]]::new()
    $found = $false
    foreach ($line in [IO.File]::ReadAllLines($target)) {
        if ($line -match '^\s*OPENAI_API_KEY\s*=') {
            $lines.Add("OPENAI_API_KEY=$plain")
            $found = $true
        } else {
            $lines.Add($line)
        }
    }
    if (-not $found) { $lines.Add("OPENAI_API_KEY=$plain") }
    [IO.File]::WriteAllLines($target, $lines, [Text.UTF8Encoding]::new($false))
    Write-Host "Da luu OPENAI_API_KEY vao file .env bi Git bo qua." -ForegroundColor Green
    Write-Host "Khoi dong lai INSTALL_AND_RUN.bat de bat che do AI API."
} finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $plain = $null
}
