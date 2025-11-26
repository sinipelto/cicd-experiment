# First, initialize the stopwatch and start it
$sw = New-Object -TypeName 'System.Diagnostics.Stopwatch';
$sw.Start()

# We need the actual path to this script => path to the repo root
# In case the script is run from different location so we cant trust its the repo dir
$pth = Split-Path $MyInvocation.MyCommand.Path -Parent;

# Read and parse the .env file and set environment variables
Get-Content "${pth}\.env" | ForEach-Object {
    # Split the line at '=' and get the key and value
    $line = $_.Trim()

    # Ignore empty lines and comments (lines starting with #)
    if ($line -ne '' -and $line -notmatch '^\s*#') {
        $parts = $line -split '='
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()

        # Set the environment variable
        [System.Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
    }
}

# .\GrismoCliDocker.ps1 cli clean; .\GrismoCliDocker.ps1 projectIoTPML ./examples/D7_CICD/<MODEL_FILE.ipm>; .\GrismoCliDocker.ps1 projectCICDConf -t <TARGET_PLATFORM> <CICD_ROOT> ./generated/<OUTPUT.yml>

# $1 = MODEL_FILE
# $2 = TARGET_PLATFORM
# $3 = CICD_ROOT
# $4 = OUTPUT

$model = ${args}[0].ToString();
$target = ${args}[1].ToString();
$root = ${args}[2].ToString();
$outp = ${args}[3].ToString();

$cmd = ${MyInvocation}.MyCommand;
function Help() {
	Write-Output "USAGE: ${cmd} ./examples/D7_CICD/<MODEL_FILE.ipm> <TARGET_PLATFORM=[gitlab|github]> <CICD_ROOT_ELEMENT> ./generated/<OUTPUT_YAML_FILE.yml>";
}

if ($args.Length -ne 4) {
	Write-Output "ERROR: Invalid num of arguments.";
	Help;
	exit 1;
}

if ($model -and !$model.EndsWith('.ipm')) {
	$model = $model + '.ipm';
}

if ($outp -and !$outp.EndsWith('.yml') -and !$outp.EndsWith('.yaml')) {
	$outp += '.yaml';
}

# Clean up neo4J DB
Write-Output "$pth\GrismoCliDocker.ps1 cli clean";
PowerShell.exe $pth\GrismoCliDocker.ps1 cli clean;

# Check if command was ruun successfully
if (!$?) {
	Write-Output "ERROR: Failed to execute Grismo CLEAN command. EXITING.";
	exit 1;
}

Write-Output "DATABASE CLEANUP OK";

# Import CICD model(s) to the DB
Write-Output "$pth\GrismoCliDocker.ps1 projectIoTPML ./examples/D7_CICD/${model}";
PowerShell.exe $pth\GrismoCliDocker.ps1 projectIoTPML ./examples/D7_CICD/${model};

# Check if command was ruun successfully
if (!$?) {
	Write-Output "ERROR: Failed to execute Grismo MODEL IMPORT command. EXITING.";
	exit 1;
}

Write-Output "CICD MODEL IMPORT OK";

# Execute generation from graphs to YAML outputs
Write-Output "$pth\GrismoCliDocker.ps1 projectCICDConf -t ${target} ${root} ./generated/${outp}";
PowerShell.exe $pth\GrismoCliDocker.ps1 projectCICDConf -t ${target} ${root} ./generated/${outp};

# Check if command was ruun successfully
if (!$?) {
	Write-Output "ERROR: Failed to execute Grismo CICD GENERATION command. EXITING.";
	exit 1;
}

Write-Output "CICD YAML GENERATION OK";

# Finally, stop the stopwatch and print the elapsed time
$sw.Stop();
Write-Output $sw;

# Append result ms to file
$rs = ${sw}.ElapsedMilliseconds;
Write-Output "${rs}" | Out-File -FilePath .\perf2_${target}.txt -Append
