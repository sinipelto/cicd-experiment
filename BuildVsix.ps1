# Build script for Windows machines using PowerShell

# Import .env
Get-Content .env | ForEach-Object {
    $name, $value = $_.split('=')
    Set-Content env:\$name $value
}

$arc = ${args}[0]

$archs=("win32-x64", "win32-arm64", "linux-x64", "linux-arm64", "linux-armhf", "alpine-x64", "alpine-arm64", "darwin-x64", "web")

function Help {
	Write-Output "USAGE: $0 <TARGET_OS-ARCH>"
	Write-Output "Supported architectures: $archs"
}

$ok = $false
foreach ($ar in $archs) {
	if ($arc -eq ${ar}) {
		$ok = $true
		break
	}
}

if (!$ok) {
	Write-Output "ERROR: Architecture provided is incorrect or not supported."
	Help
	exit 1
}

Write-Output "Starting build.."

$Env:DOCKER_BUILDKIT = 1
docker build -f build.Dockerfile --build-arg NODE_VER=${Env:NODE_VER} --build-arg TARCH=${arc} --output build .
