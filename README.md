# cicd-experiment
Repository for CI/CD Modeling and Generation approach artefacts.

This repository contains experimental artifacts for exploring **model-driven CI/CD pipeline generation and its validation**.  
It includes models, generators (projectors), scripts, Docker configurations, and test artifacts used to design, generate, and validate CI/CD-related outputs.

---

## 📂 Directory Overview

### `.vscode/`
Visual Studio Code workspace configuration.

Typically contains:
- Editor settings
- Debug configurations
- Extension recommendations

These settings help ensure a consistent development experience across contributors.

---

### `models/`
Source models that define CI/CD concepts and structures.

These models are the **input** to the generation process and are used to:
- Describe CI/CD pipelines
- Define jobs, steps, or other logic
- Drive model-to-artifact transformations

---

### `projectors/`
Model projection and transformation/generation logic.

This directory contains the source code that:
- Transforms models into concrete CI/CD artifacts
- Maps abstract definitions into platform-specific pipeline configurations or scripts

---

### `generatedArtefacts/`
Automatically generated outputs produced from the models using the generators.

These artifacts include:
- Platform-specific Pipeline definitions
- YAML Configuration files

> Contents in this directory are **generated**, not hand-written.

---

### `expectedOutputs/`
Reference outputs used for validation and testing.

This directory contains:
- Known-good expected results
- Baselines for regression testing

Generated artifacts can be compared against these files to ensure correctness.

---

### `perfTest/`
Performance testing resources.

Includes materials for:
- Measuring CI/CD generation performance
- Detecting performance regressions

---

## 🐳 Docker Configuration

### `build.Dockerfile`
Defines a container image used for building the VScode Extenstion to support the IoT-PML syntax parsing the VSCode editor.
It builds the VSIX installation package for the Grismo VsCode extenstion that can be installed to your VScode editor to support the syntax and language linting features of th IoT-PML modeling language.  

---

### `cli.Dockerfile`
Defines a container image for the 'grismo' command-line interface (CLI) tool related to the project.

Useful for:
- Running tooling without local installation
- Importing CIC/D models to the Neo4J graph database 
- Generating CI/CD configurations from the models
- Running host-independent generators inside Docker containers
- Executing tests in a reproducible environment
- Consistent execution across platforms

---

## 📜 Scripts

### `build_vsix.sh`
Bash script to build a **VSIX** package (commonly used for Visual Studio Code extensions).
This script is a Linux-based wrapper script for the build Docker image.
It requires Docker CE container engine to be installed on the host machine.

---

### `BuildVsix.ps1`
PowerShell equivalent of `build_vsix.sh`, intended for Windows environments.
This script is a (Windows-friendly) Powershell-based wrapper script for the build Docker image.
It requires Docker Desktop for Windows to be installed on the host machine.

---

### `CICDWrapper.ps1`
PowerShell wrapper script that orchestrates CI/CD-related tasks, for the CLI wrapper below.
The scripts embeds a time measurement logic for the performance evaluation done for the CI/CD generation processes. 

May be used to:
- Simplify command execution
- Provide a single entry point for CI workflows
- Import the CI/CD model to the NEo4j DB
- Generate the CI/CD configuration from the model graphs
- Cleanup the database between consequent runs

This script is a wrapper script for Win32 platforms to use the CLI Docker image easily in repetitive tasks.

---

### `GrismoCliDocker.ps1`
PowerShell script for building or running a Dockerized CLI tool in general (any model graph import or any model-to-text generation available on the platform).

Helps integrate Docker-based tooling into Windows-based repetitive taskss.

---

## 📄 License

This project is licensed under the **MIT License**.  
See the `LICENSE` file for details.

---

## 🔄 Typical Workflow

1. Define or modify CI/CD **models** in `models/`
2. Use **projectors** to generate concrete artifacts
3. Store outputs in `generatedArtefacts/`
4. Validate results against `expectedOutputs/`
5. Run builds, imports and generations using Docker using the provided wrappers scripts

---

## 💡 Notes

- Generated files should generally not be edited manually.
- Docker is recommended for consistent builds.
- Performance tests help validate the generation speeds and detect performance anomalies in the generation process.
