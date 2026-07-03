$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $workspace ".env"

if (-not (Test-Path $target)) {
    Copy-Item (Join-Path $workspace ".env.example") $target
}

$secure = Read-Host "Nhap Anthropic API key (ky tu se duoc an)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    if ($plain -notmatch '^sk-ant-[A-Za-z0-9_-]{20,}$') {
        throw "API key khong dung dinh dang Anthropic. Khong co thay doi nao duoc luu."
    }
    $updates = @{
        "ANTHROPIC_API_KEY" = $plain
        "ASSISTANT_PROVIDER" = "anthropic"
    }
    $lines = [Collections.Generic.List[string]]::new()
    $found = @{}
    foreach ($line in [IO.File]::ReadAllLines($target)) {
        $matched = $false
        foreach ($key in $updates.Keys) {
            if ($line -match "^\s*$key\s*=") {
                $lines.Add("$key=$($updates[$key])")
                $found[$key] = $true
                $matched = $true
                break
            }
        }
        if (-not $matched) {
            $lines.Add($line)
        }
    }
    foreach ($key in $updates.Keys) {
        if (-not $found.ContainsKey($key)) {
            $lines.Add("$key=$($updates[$key])")
        }
    }
    [IO.File]::WriteAllLines($target, $lines, [Text.UTF8Encoding]::new($false))
    Write-Host "Da luu ANTHROPIC_API_KEY vao file .env bi Git bo qua." -ForegroundColor Green
    Write-Host "Khoi dong lai INSTALL_AND_RUN.bat de bat che do Claude API."
} finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $plain = $null
}
