# Grismo CLI Docker wrapper script for Windows machines using PowerShell

# EXAMPLES

# Whole cycle clean from skratch
# .\GrismoCliDocker.ps1 cli clean; .\GrismoCliDocker.ps1 projectIoTPML ./examples/D7_CICD/e0_cicd_multiplatform.ipm; .\GrismoCliDocker.ps1 projectCICDConf -t github cicdRoot ./generated/test.yaml

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

Write-Output "Preparing database..";

$dbn = 'neodb';

# If neo not yet running, fetch & run
$dbrn = $(docker ps | grep ${dbn});
$dbex = $(docker ps -a | grep ${dbn});

# Running, exist
if (${dbrn}) {
	# OK
	Write-Output "Database alraedy running. Skipping db setup.";
}
# Not running, might exist
else {
	# Remove active container instance if exists
	if (${dbex}) {
		docker rm ${dbn}
	}

	# Remove might fail so dont care
	# if (!$?) {
	# 	Write-Output "ERROR: Failed to stop old neo4j db instance. EXITING."
	# 	exit 1
	# }

	docker run `
		-d `
		--name ${dbn} `
		-p 0.0.0.0:7474:7474 `
		-p 0.0.0.0:7687:7687 `
		-v ${pth}\neo4j\data:/data `
		-e NEO4J_ACCEPT_LICENSE_AGREEMENT=yes `
		-e NEO4J_AUTH=${Env:NEODB_USER}/${Env:NEODB_PASS} `
		neo4j:${Env:NEODB_VERSION}

	# Sleep couple sec to allow db to initialize
	Start-Sleep -Seconds 30;

	if (!$?) {
		Write-Output "ERROR: Failed to start neo4j db. EXITING.";
		exit 1;
	}
}

Write-Output "Prepare Grismo CLI environment..";

$cn = 'grismo-cli';

$b = ($args.Length -ge 2 -and $args[0].ToLower() -eq "cli" -and $args[1].ToLower() -eq "build");
$c = ($args.Length -ge 2 -and $args[0].ToLower() -eq "cli" -and $args[1].ToLower() -eq "clean");

$img = $(docker image ls | grep ${cn})

if ($c) {
	Write-Output "Clean requested. Clearing up neo4j DB graph data.."
	docker exec -it ${dbn} cypher-shell -u ${Env:NEODB_USER} -p ${Env:NEODB_PASS} "MATCH (n) DETACH DELETE n;"
}
elseif (!$img -or $b) {
	Write-Output "Missing cli image OR (re)build requested. Building from skratch...";

	$Env:DOCKER_BUILDKIT = 1;
	docker build `
		-f cli.Dockerfile `
		--build-arg NODE_VER=${Env:NODE_VER} `
		--tag ${cn} `
		.

	if (!$?) {
		Write-Output "ERROR: Failed to build cli image. EXITING.";
		exit 1;
	}
}
elseif ($args[0].ToString().Equals("projectIoTPML")) {
	Write-Output "WARNING: projectIoTPML command detected. Build omitted due to unlikely changes to the projector source code.";
	Write-Output "WARNING: If you have changed the 'projectorIoTPML.ts' source code just recently, please run me with args 'cli build' first to rebuild the image forcefully.";
}
else {
	Write-Output "CLI image exists. Trying to re-build with cache...";

	# Rebuild any case to refresh changed source files
	# Should use cache if no changes
	$Env:DOCKER_BUILDKIT = 1;
	docker build `
	-f cli.Dockerfile `
	--build-arg NODE_VER=${Env:NODE_VER} `
	--tag ${cn} `
	.
}

# If build or clean only, exit here with success code
if ($b -or $c) { exit 0; }

Write-Output "Starting either Model-to-DB Import or DB-to-Outputs Generation...";

# Start the cli, execute command with given args and delete the container after
# Mount examples to dynamically provide up-to-date model files for the CLI
# Mount generated to get any generated artefacts out of the container easily
docker run `
	--rm `
	-it `
	-e NEODB_URL="${Env:NEODB_URL}" `
	-v ${pth}\generated:/app/generated `
	-v ${pth}\examples:/app/examples `
	${cn} ${args}

# Check if command was ruun successfully
if (!$?) {
	Write-Output "ERROR: Failed to execute Grismo CLI command. EXITING.";
	exit 1;
}

Write-Output "Grismo CLI command processed. Check 'generated/' directory for possible generated artefacts.";
