import { Neo4jInterface } from '../neo4j/neo4j.js';
import { writeFileSync } from "fs";
import { expandToString } from 'langium/generate';

// Data structures to hold the configuration

interface JobSpecification {
  name: string;              // name of the job
  stage: string             // stage of the job
  commands: Map<string, string>;      // commands/scripts to be executed in this job
  image: Map<string, string>;             // container image
  permissions: Map<string, string>;       // permissions (only in github)
  dependencies: string[];    // dependencies (only in gitlab)
  caches: Array<Map<string, string | string[]>>   // List of cache configurations
  baseOs: string;            // base os for platform runner
  checkoutRef: string;       // ref to checkout)
  checkout: Map<string, string> // checkout configuration
  libraries: Array<Map<string, string>> // custom libraries
  outputs: Map<string, string> // collect outputs from jobs
  upArtifact: Map<string, string>;      // artifacts to upload
  upArtifactPaths: string[];      // artifact paths to upload
  upArtifactExcludes: string[];      // artifact paths to exclude
  downArtifact: Map<string, string>;    // artifacts to download
  environment: Map<string, string>;   // release environment
  release: Map<string, string>; // release configuration
  releasePaths: string[]    // files to include in the release
  reportArtifact: Map<string, string> // GL: report e.g. dotenv file to pass variables
  timeout: number // Job timeout
  retry: number // Job retry count
}

interface GlobalConfig {
  description: string;                // documentation/name of the pipeline
  onPush: Map<string, string[]>;      // events on push (github only)
  onPR: Map<string, string[]>;        // events on pull request (github only)
  variables: Map<string, string>;     // script global variables
  permissions: Map<string, string>;   // permissions (GitHub)
}

// Expected keywords/structure (generator configuration)
enum SubPackageKeyword {
  jobs = 'jobs',
  meta = 'meta',
}

enum JobBehaviorKeyword {
  stage = 'setStage',
  exec = 'executionScript',
  deps = 'setDependencies',
  perms = 'setPermissions',
  img = 'setContainerImage',
  cache = 'setCache',
  buildArtifact = 'setBuildArtifact',
  dlArtifact = 'setDownloadArtifact',
  release = 'setRelease',
  env = 'setEnvironment',
  report = 'setReportArtifact',
  checkOut = 'setCheckout',
  library = 'setLibrary',
  cond = 'setConditions',
  include = 'includeScript',
}

enum ConfigKeyword {
  configRoot = 'configurePipeline',
  push = 'onPush',
  PR = 'onPullRequest',
  types = 'setTypes',
  vars = 'setGlobalVariables',
  perms = 'setGlobalPermissions',
  incBranch = 'includeBranches',
  excBranch = 'excludeBranches',
  incFile = 'includeFiles',
  excFile = 'excludeFiles',
}

enum Keyword {
  doc = 'doc',
}

/**
 * Get all SWComponentUsages in the package 'packetName' 
 * In the context of CICD configuration this expresses:
 *   - github jobs
 *   - gitlab jobs
 * @param rootName 
 * @returns 
 */
function getJobSWComponentsOf(rootName: string): string {
  return `match (p:Package {name: '${rootName}'})-[:OWNEDRELATIONSHIP]->(q:Package {name: '${SubPackageKeyword.jobs}'})-[:OWNEDRELATIONSHIP]->(s:SWComponentUsage) return s.name, s.baseOs, s.checkoutRef, s.timeout, s.retry`
}

function getJobSWBehaviorStatementsOf(rootName: string, jobName: string, behaviorName: string): string {
  return `match (p:Package {name: '${rootName}'})-[:OWNEDRELATIONSHIP]->(q:Package {name: '${SubPackageKeyword.jobs}'})-[:OWNEDRELATIONSHIP]->(s:SWComponentUsage {name: '${jobName}'})-[:OWNEDRELATIONSHIP]->(b:Behavior {name: '${behaviorName}'})-[:OWNEDRELATIONSHIP]->(e:ExpressionStatement) return e.name, e.expression, b.name, b.key, b.version`
}

function getJobSWBehaviorNamesOf(rootName: string, jobName: string): string {
  return `match (p:Package {name: '${rootName}'})-[:OWNEDRELATIONSHIP]->(q:Package {name: '${SubPackageKeyword.jobs}'})-[:OWNEDRELATIONSHIP]->(s:SWComponentUsage {name: '${jobName}'})-[:OWNEDRELATIONSHIP]->(b:Behavior) return b.name, b.key, b.version`
}

function getSWBehaviorStatementsOf(rootName: string, swComponentName: string, behaviorName: string): string {
  return `match (p:Package {name: '${rootName}'})-[:OWNEDRELATIONSHIP]->(s:SWComponentUsage {name: '${swComponentName}'})-[:OWNEDRELATIONSHIP]->(b:Behavior {name: '${behaviorName}'})-[:OWNEDRELATIONSHIP]->(e:ExpressionStatement) return e.name, e.expression`
}

function getSWBehaviorOfSWStatementsOf(rootName: string, swName: string, subSwName: string, behaviorName: string): string {
  return `match (p:Package {name: '${rootName}'})-[:OWNEDRELATIONSHIP]->(s:SWComponentUsage {name: '${swName}'})-[:OWNEDRELATIONSHIP]->(s2:SWComponentUsage {name: '${subSwName}'})-[:OWNEDRELATIONSHIP]->(b:Behavior {name: '${behaviorName}'})-[:OWNEDRELATIONSHIP]->(e:ExpressionStatement) return e.name, e.expression`
}

function getGlobalName(rootName: string): string {
  return `match (p:Package {name: '${rootName}'})-[:OWNEDRELATIONSHIP]->(q:Package {name: '${SubPackageKeyword.meta}'}) return q.${Keyword.doc}`
}

export function getCPsequenceOf(packetName: string): string {
  return `match (pa:Package {name: '${packetName}'})-[:OWNEDRELATIONSHIP]->(pcp:InitialControlPoint)
           match p=((pcp)-[:IS_NEXT*]->(ccp:ClosingControlPoint))
           return [x in nodes(p) | x.name] as sequence`
}

// ****************************
// ********** GITLAB **********
// ****************************

function serStageListGitlab(jobs: JobSpecification[]): string {
  if (jobs.length && jobs.find(x => x.stage?.length)) {
    return expandToString`
      stages:
        ${'- ' + jobs.map((x) => x.stage).reverse().join('\n- ')}
    `;
  }
  return '';
}

function serVariableListGitlab(globalConf: GlobalConfig): string {
  if (globalConf.variables?.size) {
    return expandToString`
      variables:
        ${Array.from(globalConf.variables.keys()).reverse().map((x) => x + ': ' + globalConf.variables.get(x)).join('\n')}
    `;
  }
  return '';
}

function serGlobalNameGitlab(globalConf: GlobalConfig): string {
  return expandToString`
    workflow:
      name: ${globalConf.description}
  `;
}

function serJobGitLab(jobConf: JobSpecification, globalConf: GlobalConfig): string {
  let str = expandToString`
    ${jobConf.name}:
  `;

  if (jobConf.stage?.length) {
    str += '\n  ';
    str += expandToString`
      stage: ${jobConf.stage}
    `;
  }

  if (jobConf.baseOs?.length) {
    str += '\n  ';
    str += expandToString`
      tags:
          - ${jobConf.baseOs}
    `;
  }

  if (globalConf.onPush?.size) {
    if (globalConf.onPush.get(ConfigKeyword.incBranch)?.length || globalConf.onPush.get(ConfigKeyword.incFile)?.length) {
      str += '\n  ';
      str += expandToString`
        rules:
            - if: \${CI_PIPELINE_SOURCE} == "push"
      `;

      // if (globalConf.onPush.get(ConfigKeyword.incFile)?.length) {
      //   str += '\n      ';
      //   str += expandToString`
      //     changes:
      //           paths:
      //             ${'- ' + globalConf.onPush.get(ConfigKeyword.incFile)!.reverse().map((x) => '\"' + x + '\"').join('\n- ')}
      //   `;
      // }

      str += '\n  ';
      str += expandToString`
        only:
      `;

      if (globalConf.onPush.get(ConfigKeyword.incBranch)?.length) {
        str += '\n    ';
        str += expandToString`
          refs:
                ${'- ' + globalConf.onPush.get(ConfigKeyword.incBranch)!.reverse().map(x => '\"' + x +'\"').join('\n- ')}
        `;
      }
      if (globalConf.onPush.get(ConfigKeyword.incFile)?.length) {
        str += '\n    ';
        str += expandToString`
          changes:
                ${'- ' + globalConf.onPush.get(ConfigKeyword.incFile)!.reverse().map((x) => '\"' + x + '\"').join('\n- ')}
        `;
      }
    }
    if (globalConf.onPush.get(ConfigKeyword.excBranch)?.length || globalConf.onPush.get(ConfigKeyword.excFile)?.length) {
      str += '\n  ';
      str += expandToString`
        except:
      `;

      if (globalConf.onPush.get(ConfigKeyword.excBranch)?.length) {
        str += '\n    ';
        str += expandToString`
          refs:
                ${'- ' + globalConf.onPush.get(ConfigKeyword.excBranch)!.reverse().map(x => '\"' + x + '\"').join('\n- ')}
        `;
      }

      if (globalConf.onPush.get(ConfigKeyword.excFile)?.length) {
        str += '\n    ';
        str += expandToString`
          changes:
                ${'- ' + globalConf.onPush.get(ConfigKeyword.excFile)!.reverse().map((x) => '\"' + x + '\"').join('\n- ')}
        `;
      }
    }
  }

  if (jobConf?.image?.size) {
    str += '\n  ';
    str += expandToString`
      image:
          name: ${jobConf.image.get('name')}
    `;

    if (jobConf?.image.has('entryPoint')) {
      str += '\n    ';
      str += expandToString`
        entrypoint: ${jobConf.image.get('entryPoint')}
      `;
    }

  }

  if (jobConf.dependencies?.length) {
    str += '\n  ';
    str += expandToString`
      needs:
          ${'- ' + jobConf.dependencies.reverse().join('\n- ')}
    `;
  }

  if (jobConf.caches?.length && jobConf?.caches?.findLast(p => p)?.get('key')?.length) {
    str += '\n  ';
    str += expandToString`
      cache:
    `;

    for (const cache of jobConf.caches) {
      str += '\n    ';
      str += expandToString`
        - key: ${cache.get('key')}
      `;

      if (cache.has('when')) {
        str += '\n      ';
        str += expandToString`
          when: ${cache.get('when')}
        `;
      }

      if (cache.has('untracked')) {
        str += '\n      ';
        str += expandToString`
          untracked: ${cache.get('untracked')}
        `;
      }

      str += '\n      ';
      str += expandToString`
        paths:
                ${'- ' + (cache.get('paths') as string[]).reverse().join('\n- ')}
      `;
    }
  }

  if (jobConf?.timeout) {
    str += '\n  ';
    str += expandToString`
      timeout: ${jobConf.timeout} minutes
    `;
  }

  if (jobConf?.retry) {
    str += '\n  ';
    str += expandToString`
      retry: ${jobConf.retry}
    `;
  }

  // if (jobConf.cacheKey?.length && jobConf.cachePaths?.length) {
  //   str += '\n  ';
  //   str += expandToString`
  //     cache:
  //         key: ${jobConf.cacheKey}
  //         when: on_success
  //         untracked: false
  //   `;

  //   // Paths are required
  //   str += '\n    ';
  //   str += expandToString`
  //     paths:
  //           ${'- ' + jobConf.cachePaths.reverse().map((x) => '\'' + x + '\'').join('\n- ')}
  //   `;
  // }

  // SCRIPT WITH AT LEAST ONE STATEMENT IS ALWAYS REQUIRED IN GL!!!!
  // WORKAROUND: Echo something in every script
  str += '\n  ';
  str += expandToString`
    script:
        - 'echo "Executing Job: ${jobConf.name}"'
        ${(jobConf?.commands?.size) ? '- ' + Array.from(new Map([...jobConf.commands].sort( (a,b) => parseInt(a[0]) - parseInt(b[0]) )).values()).map(x => '\'' + x + '\'').join('\n- ') : ''}
  `;

  if ((jobConf.upArtifact?.size && jobConf.upArtifactPaths?.length) || jobConf.reportArtifact?.size) {
    str += '\n  ';
    str += expandToString`
      artifacts:
    `;
  }

  if (jobConf.upArtifact?.size) {
    if (jobConf.upArtifact.has('name')) {
      str += '\n    ';
      str += expandToString`
        name: ${jobConf.upArtifact.get('name')}
      `;
    }

    if (jobConf.upArtifact.has('when')) {
      str += '\n    ';
      str += expandToString`
        when: ${jobConf.upArtifact.get('when')}
      `;
    }
    else {
      str += '\n    ';
      str += expandToString`
        when: on_success
      `;
    }

    if (jobConf.upArtifact.has('untracked')) {
      str += '\n    ';
      str += expandToString`
        untracked: ${jobConf.upArtifact.get('untracked')}
      `;
    }
    else {
      str += '\n    ';
      str += expandToString`
        untracked: false
      `;
    }

    if (jobConf.upArtifact.has('access')) {
      str += '\n    ';
      str += expandToString`
        access: ${jobConf.upArtifact.get('access')}
      `;
    }
    
    if (jobConf.upArtifact.has('expiryIn')) {
      str += '\n    ';
      str += expandToString`
        expire_in: ${jobConf.upArtifact.get('expiryIn')} days
      `;
    }

    if (jobConf.upArtifactPaths?.length) {
      str += '\n    ';
      str += expandToString`
        paths:
              ${'- ' + jobConf.upArtifactPaths.reverse().join('\n- ')}
      `;
    }

    if (jobConf.upArtifactExcludes?.length) {
      str += '\n    ';
      str += expandToString`
        exclude:
              ${'- ' + jobConf.upArtifactExcludes.reverse().join('\n- ')}
      `;
    }
  }

  if (jobConf.reportArtifact?.size) {
    str += '\n    ';
    str += expandToString`
      reports:
            ${Array.from(jobConf.reportArtifact.keys()).reverse().map((k) => k + ': ' + jobConf.reportArtifact.get(k)).join('\n')}
    `;
  }

  if (jobConf.environment?.size) {
    str += '\n  ';
    str += expandToString`
      environment:
          name: ${jobConf.environment.get('name')}
    `;
    if (jobConf.environment.has('url')) {
      str += '\n    ';
      str += expandToString`
        url: ${jobConf.environment.get('url')}
      `;
    }
    if (jobConf.environment.has('action')) {
      str += '\n    ';
      str += expandToString`
        action: ${jobConf.environment.get('action')}
      `;
    }
    if (jobConf.environment.has('deploymentTier')) {
      str += '\n    ';
      str += expandToString`
        deployment_tier: ${jobConf.environment.get('deploymentTier')}
      `;
    }
  }

  if (jobConf.release?.size && jobConf.releasePaths?.length) {
    str += '\n  ';
    str += expandToString`
      release:
          name: ${jobConf.release.get('name')}
    `;
    if (jobConf.release.has('description')) {
      str += '\n    ';
      str += expandToString`
        description: ${jobConf.release.get('description')}
      `;
    }
    if (jobConf.release.has('releaseTag')) {
      str += '\n    ';
      str += expandToString`
        tag_name: ${jobConf.release.get('releaseTag')}
      `;
    }
    if (jobConf.release.has('tagMsg')) {
      str += '\n    ';
      str += expandToString`
        tag_message: ${jobConf.release.get('tagMsg')}
      `;
    }
    if (jobConf.release.has('releaseRef')) {
      str += '\n    ';
      str += expandToString`
        ref: ${jobConf.release.get('releaseRef')}
      `;
    }
  }

  return str;
}

// ****************************
// ********** GITHUB **********
// ****************************

// Github serialization
function serGlobalNameGithub(globalConf: GlobalConfig): string {
  return expandToString`
    name: ${globalConf.description}
  `;
}

function serTriggersGithub(globalConf: GlobalConfig): string {
  // Remember to add any new trigger types here
  if (
    !globalConf?.onPush?.size &&
    !globalConf?.onPR?.size &&
    !globalConf.onPush.get(ConfigKeyword.incBranch)?.length &&
    !globalConf.onPush.get(ConfigKeyword.excFile)?.length &&
    !globalConf.onPR.get(ConfigKeyword.incBranch)?.length &&
    !globalConf.onPR.get(ConfigKeyword.excFile)?.length
  ) {
    return '';
  }

  let ret: string = expandToString`on:`;

  if (globalConf.onPush?.size && Array.from(globalConf.onPush?.values()).some(e => e?.length)) {
    ret += '\n  ';
    ret += expandToString`push:`;

    if (globalConf.onPush.get(ConfigKeyword.incBranch)?.length) {
      ret += '\n    ';
      ret += expandToString`
        branches:
              ${'- ' + globalConf.onPush.get(ConfigKeyword.incBranch)!.reverse().map(x => '\'' + x + '\'').join('\n- ')}
    `;
    }

    if (globalConf.onPush.get(ConfigKeyword.excFile)?.length) {
      ret += '\n    ';
      ret += expandToString`
          paths-ignore: 
                ${'- ' + globalConf.onPush.get(ConfigKeyword.excFile)!.reverse().map((x) => '\'' + x + '\'').join('\n- ')}
    `;
    }
  }

  if (globalConf.onPR?.size && Array.from(globalConf.onPR?.values()).some(e => e?.length)) {
    ret += '\n  ';
    ret += expandToString`pull_request:`;

    if (globalConf.onPR.get(ConfigKeyword.types)?.length) {
      ret += '\n    ';
      ret += expandToString`
        types: [${globalConf.onPR.get(ConfigKeyword.types)!.reverse().join(', ')}]
      `;
    }

    if (globalConf.onPR.get(ConfigKeyword.incBranch)?.length) {
      ret += '\n    ';
      ret += expandToString`
        branches:
              ${'- ' + globalConf.onPR.get(ConfigKeyword.incBranch)!.reverse().map((x) => '\'' + x + '\'').join('\n- ')}
      `;
    }

    if (globalConf.onPR.get(ConfigKeyword.excFile)?.length) {
      ret += '\n    ';
      ret += expandToString`
        paths-ignore:
              ${'- ' + globalConf.onPR.get(ConfigKeyword.excFile)!.reverse().map((x) => '\'' + x + '\'').join('\n- ')}
      `;
    }
  }

  return ret;
}

function serGlobalPermsGithub(globalConf: GlobalConfig): string {
  if (globalConf.permissions.size) {
    return expandToString`
    permissions:
      ${Array.from(globalConf.permissions.keys()).reverse().map((x) => x + ': ' + globalConf.permissions.get(x)).join('\n')}
    `;
  }
  return '';
}

function serVariableListGithub(globalConf: GlobalConfig): string {
  if (globalConf.variables.size) {
    return expandToString`
    env:
      ${Array.from(globalConf.variables.keys()).reverse().map((x) => x + ': ' + globalConf.variables.get(x)).join('\n')}
    `;
  }
  return ''
}

function serJobGithub(header: boolean, jobConf: JobSpecification, globalConf: GlobalConfig): string {
  let ret = (header) ? 'jobs:\n  ' : '  ';

  ret += expandToString`
    ${jobConf.name}:
  `;

  if (jobConf?.baseOs?.length) {
    ret += '\n    ';
    ret += expandToString`
      runs-on: ${jobConf.baseOs}
    `;
  }

  if (jobConf?.image?.size) {
    ret += '\n    ';
    ret += expandToString`
      container:
            image: ${jobConf.image.get('name')}
    `;
  }

  if (jobConf.permissions?.size) {
    ret += '\n    ';
    ret += expandToString`
      permissions:
            ${Array.from(jobConf.permissions.keys()).reverse().map((x) => x + ': ' + jobConf.permissions.get(x)).join('\n')}
    `;
  }

  if (jobConf.dependencies?.length) {
    ret += '\n    ';
    ret += expandToString`
      needs:
            ${'- ' + jobConf.dependencies.reverse().join('\n- ')}
    `;
  }

  if (jobConf?.timeout) {
      ret += '\n    ';
      ret += expandToString`
        timeout-minutes: ${jobConf.timeout}
      `;
  }

  // NOT SUPPORTED IN GHA!!!
  // if (jobConf?.retry) {
  //     ret += '\n    ';
  //     ret += expandToString`
  //       max_attempts: ${jobConf.retry}
  //     `;
  // }

  // Environment (not steps/script)  
  if (jobConf.environment.size) {
    ret += '\n    ';
    ret += expandToString`
      environment:
            name: ${jobConf.environment.get('name')}
    `;
    if (jobConf.environment.has('url')) {
      ret += '\n      ';
      ret += expandToString`
        url: ${jobConf.environment.get('url')}
      `;
    }
  }

  // Determine if we need steps
  if (jobConf.commands?.size ||
    (jobConf.caches?.length && jobConf.caches.findLast(p => p)?.get('key')?.length) ||
    jobConf.checkoutRef?.length || jobConf.downArtifact?.size ||
    jobConf.upArtifactPaths?.length ||
    jobConf.environment?.size) {
    ret += '\n    ';
    ret += expandToString`
      steps:
    `;
  }

  // Backwards compatible => checkoutRef: string = checkout ref: <REF>
  if (jobConf.checkoutRef?.length || jobConf.checkout?.size) {
    ret += '\n      ';
    ret += expandToString`
      - uses: actions/checkout@v5
              with:
    `;

    // Backwards compatibility
    if (!jobConf.checkout?.size && jobConf.checkoutRef?.length) {
      ret += '\n          ';
      ret += expandToString`
        ref: ${jobConf.checkoutRef}
      `;
    }

    if (jobConf.checkout.has('name')) {
      ret += '\n          ';
      ret += expandToString`
        ref: ${jobConf.checkout.get('name')}
      `;
    }

    if (jobConf.checkout.has('depth')) {
      ret += '\n          ';
      ret += expandToString`
        fetch-depth: ${jobConf.checkout.get('depth')}
      `;
    }

    if (jobConf.checkout.has('submodules')) {
      ret += '\n          ';
      ret += expandToString`
        submodules: ${jobConf.checkout.get('submodules')}
      `;
    }
  }

  if (jobConf.caches?.length) {
    for (const cache of jobConf.caches) {
      ret += '\n      ';
      ret += expandToString`
        - uses: actions/cache@v4
                with:
                  key: ${cache.get('key')}
                  path: |
                    ${(cache.get('paths') as string[]).reverse().map(x => '\'' + x + '\'').join('\n')}
      `;
    }
  }

  // Handle custom libraries
  if (jobConf.libraries?.length) {
    // Loob all libs
    for (const lib of jobConf.libraries) {
      // Init lib base
      ret += '\n      ';
      ret += expandToString`
        - uses: ${lib?.get('lib_name')}@${lib?.get('lib_version')}
      `;

      // Remove base lib info
      lib?.delete('lib_name');
      lib?.delete('lib_version');

      // Check for additional params
      if (lib?.size)
        ret += '\n        ';
      ret += expandToString`
          with:
        `;
      // Insert params key: val
      for (const [k, v] of lib?.entries()!) {
        if (k == 'id') continue;
        ret += '\n          ';
        ret += expandToString`
          ${k}: ${v}
        `;
      }
    }
  }

  if (jobConf.commands?.size) {
    // Sort commands numerically based on key as Number
    ret += '\n      ';
    ret += expandToString`
      - run: |
                ${Array.from(new Map([...jobConf.commands].sort( (a,b) => parseInt(a[0]) - parseInt(b[0]) )).values()).join('\n')}
    `;
  }

  if (jobConf.downArtifact.size) {
    ret += '\n      ';
    ret += expandToString`
      - uses: actions/download-artifact@v4
              with:
                name: ${jobConf.downArtifact.get('name')}
    `;
    if (jobConf.downArtifact.has('dest')) {
      ret += '\n          ';
      ret += expandToString`
        path: ${jobConf.downArtifact.get('dest')}
      `;
    }
  }

  if (jobConf.upArtifact?.size && jobConf.upArtifactPaths?.length) {
    // name is mandatory
    ret += '\n      ';
    ret += expandToString`
      - uses: actions/upload-artifact@v4
              with:
                name: ${jobConf.upArtifact.get('name') ?? ''}
    `;

    // if-no-files-found, retention-days, compression-level, include-hidden-files are optional
    if (jobConf.upArtifact.has('ifNoFilesFound')) {
      ret += '\n          ';
      ret += expandToString`
        if-no-files-found: ${jobConf.upArtifact.get('ifNoFilesFound')}
      `;
    }
    if (jobConf.upArtifact.has('expiryIn')) {
      ret += '\n          ';
      ret += expandToString`
        retention-days: ${jobConf.upArtifact.get('expiryIn')}
      `;
    }
    if (jobConf.upArtifact.has('compressionLevel')) {
      ret += '\n          ';
      ret += expandToString`
        compression-level: ${jobConf.upArtifact.get('compressionLevel')}
      `;
    }
    if (jobConf.upArtifact.has('overwrite')) {
      ret += '\n          ';
      ret += expandToString`
        overwrite: ${jobConf.upArtifact.get('overwrite')}
      `;
    }
    if (jobConf.upArtifact.has('includeHiddenFiles')) {
      ret += '\n          ';
      ret += expandToString`
        include-hidden-files: ${jobConf.upArtifact.get('includeHiddenFiles')}
      `;
    }

    // manage upload artifact paths
    ret += '\n          ';
    ret += expandToString`
      path: |
                  ${jobConf.upArtifactPaths.reverse().join('\n')}
    `;

    if (jobConf?.upArtifactExcludes?.length) {
      ret += '\n            ';
      ret += expandToString`
                  ${jobConf.upArtifactExcludes.reverse().map(x => '!' + x).join('\n            ')}
      `;
    }
  }

  // Release (not stesps/script)
  if (jobConf.release?.size && jobConf.releasePaths?.length) {
    // Name is compulsory
    ret += '\n      ';
    ret += expandToString`
      - uses: softprops/action-gh-release@v2
              with:
                name: ${jobConf.release.get('name') ?? ''}
    `;
    if (jobConf.release.has('repoToken')) {
      ret += '\n          ';
      ret += expandToString`
        token: ${jobConf.release.get('repoToken')}
      `;
    }
    if (jobConf.release.has('description')) {
      ret += '\n          ';
      ret += expandToString`
        body: ${jobConf.release.get('description')}
      `;
    }
    if (jobConf.release.has('releaseTag')) {
      ret += '\n          ';
      ret += expandToString`
        tag_name: ${jobConf.release.get('releaseTag')}
      `;
    }
    if (jobConf.release.has('preRelease')) {
      ret += '\n          ';
      ret += expandToString`
        prerelease: ${jobConf.release.get('preRelease')}
      `;
    }
    if (jobConf.release.has('draft')) {
      ret += '\n          ';
      ret += expandToString`
        draft: ${jobConf.release.get('draft')}
      `;
    }
    if (jobConf.release.has('makeLatest')) {
      ret += '\n          ';
      ret += expandToString`
        make_latest: ${jobConf.release.get('makeLatest')}
      `;
    }
    if (jobConf.releasePaths?.length) {
      ret += '\n          ';
      ret += expandToString`
        files: |
                    ${jobConf.releasePaths.reverse().join('\n')}
      `;
    }
  }

  return ret;
}

// *******************************
// ********** VARIABLES **********
// *******************************

function parseSpecialVariablesGitlab(input: string): string {
  return input
    // First, handle any special fixed variables
    .replaceAll('<<BASE_OS_LINUX>>', 'saas-linux-medium-amd64')
    .replaceAll('<<PIPELINE_ID>>', '${CI_PIPELINE_ID}')
    .replaceAll('<<PIPELINE_REF>>', '${CI_COMMIT_BRANCH}')
    .replaceAll('<<GIT_REPOSITORY_URL>>', '${CI_REPOSITORY_URL}')
    .replaceAll('<<CI_SERVER_URL>>', '${CI_SERVER_HOST}')
    .replaceAll('<<CI_COMMIT_SHA>>', '${CI_COMMIT_SHA}')
    .replaceAll('<<CI_EVENT_NAME>>', '${CI_PIPELINE_SOURCE}')
    .replaceAll('<<CI_PR_HEAD_SHA>>', '${CI_MERGE_REQUEST_SOURCE_BRANCH_SHA}')
    // Replace any Secrets
    .replaceAll(/<<SECRET\_(.*?)?>>/g, '\$\{$1\}')
    // Replace any Environemnt
    .replaceAll(/<<ENV\_(.*?)?>>/g, '\$\{$1\}')
    // Replace any Variables
    .replaceAll(/<<VAR\_(.*?)>>/g, '\$\{$1\}')
    // Then handle all non-special variables left
    // ? for non-greedy -> capture chained variables properly
    .replaceAll(/<<(.*?)>>/g, '\$\{$1\}')
    ;
}

function parseSpecialVariablesGithub(input: string): string {
  return input
    // First, handle any special fixed variables
    .replaceAll('<<BASE_OS_LINUX>>', 'ubuntu-latest')
    .replaceAll('<<PIPELINE_ID>>', '${{ github.run_id }}')
    .replaceAll('<<PIPELINE_REF>>', '${{ github.ref }}')
    .replaceAll('<<GIT_REPOSITORY_URL>>', '${{ github.repositoryUrl }}')
    .replaceAll('<<REPO_TOKEN>>', '${{ secrets.GITHUB_TOKEN }}')
    .replaceAll('<<CI_SERVER_URL>>', '${GITHUB_SERVER_URL}')
    .replaceAll('<<CI_COMMIT_SHA>>', '${{ github.sha }}')
    .replaceAll('<<CI_EVENT_NAME>>', '${{ github.event_name }}')
    .replaceAll('<<CI_PR_HEAD_SHA>>', '${{ github.event.pull_request.head.sha }}')
    // Replace any Secrets
    .replaceAll(/<<SECRET\_(.*?)>>/g, '\$\{\{ secrets\.$1 \}\}')
    // Replace any Environment
    .replaceAll(/<<ENV\_(.*?)>>/g, '\$\{\{ env\.$1 \}\}')
    // Replace any Variables
    .replaceAll(/<<VAR\_(.*?)>>/g, '\$\{\{ vars\.$1 \}\}')
    // Then handle all non-special variables left
    // ? for non-greedy -> capture chained variables properly
    .replaceAll(/<<(.*?)>>/g, '\$\{\{ $1 \}\}')
    ;
}

// ********************************
// ********** GENERATION **********
// ********************************

export async function generateCICDConf(packageRoot: string, targetPlatform: string, outputFileName: string) {

  // open driver 
  const neo4jInterface = new Neo4jInterface();
  neo4jInterface.openDriver();

  // get global config 
  let globalConfig: GlobalConfig = {
    description: '',
    onPush: new Map<string, []>,
    onPR: new Map<string, []>,
    variables: new Map<string, string>,
    permissions: new Map<string, string>,
  };

  // to get all job names
  let records = await neo4jInterface.queryNodes(getJobSWComponentsOf(packageRoot));
  let jobs: JobSpecification[] = []
  if (records != undefined) {
    for (let singleRecord of records) {
      const baseOs = singleRecord.get('s.baseOs')
      jobs.push({
        name: singleRecord.get('s.name'),
        checkoutRef: singleRecord.get('s.checkoutRef'),
        timeout: singleRecord.get('s.timeout'),
        retry: singleRecord.get('s.retry'),
        commands: new Map<string, string>,
        image: new Map<string, string>,
        stage: '',
        permissions: new Map<string, string>,
        dependencies: [],
        baseOs: baseOs,
        upArtifact: new Map<string, string>,
        upArtifactPaths: [],
        upArtifactExcludes: [],
        release: new Map<string, string>,
        releasePaths: [],
        downArtifact: new Map<string, string>,
        environment: new Map<string, string>,
        reportArtifact: new Map<string, string>,
        checkout: new Map<string, string>,
        libraries: new Array<Map<string, string>>,
        outputs: new Map<string, string>,
        caches: new Array<Map<string, any>>,
      });
    }
  }

  records = await neo4jInterface.queryNodes(getGlobalName(packageRoot));

  if (!records?.length) {
    console.error('ERROR: Pipeline name not found in package: ' + packageRoot);
    neo4jInterface.closeDriver();
    throw new Error('Projector execution failed.');
  }

  globalConfig.description = records[0].get(`q.${Keyword.doc}`);

  // Iterate over configurePipeline -> swComponent -> behavior -> statements
  for (const confEntryName of Object.values(ConfigKeyword)) {

    // package(packageRoot) -> sw('configurePipeline') -> behavior(confEntryName) -> statements[]
    const statements = await neo4jInterface.queryNodes(getSWBehaviorStatementsOf(packageRoot, ConfigKeyword.configRoot, confEntryName));

    switch (confEntryName) {
      // onPush
      case ConfigKeyword.push:
        for (const kw of Object.values(ConfigKeyword)) {
          const configSwStmts = await neo4jInterface.queryNodes(getSWBehaviorOfSWStatementsOf(packageRoot, ConfigKeyword.configRoot, confEntryName, kw));
          if (configSwStmts == undefined) break;
          globalConfig.onPush.set(kw, []);
          for (const stmt of configSwStmts) {
            if (stmt == undefined) continue;
            globalConfig.onPush.get(kw)?.push(stmt.get('e.expression'));
          }
        }
        break;
      // onPullRequest
      case ConfigKeyword.PR:
        for (const kw of Object.values(ConfigKeyword)) {
          const configSwStmts = await neo4jInterface.queryNodes(getSWBehaviorOfSWStatementsOf(packageRoot, ConfigKeyword.configRoot, confEntryName, kw));
          if (!configSwStmts) break;
          globalConfig.onPR.set(kw, []);
          for (const stmt of configSwStmts) {
            if (!stmt) continue;
            const val = stmt.get('e.expression');
            if (val?.length) {
              globalConfig.onPR.get(kw)?.push(val);
            }
          }
        }
        break;

      // setGlobalVariables
      case ConfigKeyword.vars:
        // Skip if no configuration statements found
        if (!statements) continue;
        for (const stmt of statements) {
          globalConfig.variables.set(stmt.get('e.name').toUpperCase(), stmt.get('e.expression'))
        }
        break;
      // setGlobalPermissions
      case ConfigKeyword.perms:
        // Skip if no configuration statements found
        if (!statements) continue;
        for (const stmt of statements) {
          globalConfig.permissions.set(stmt.get('e.name'), stmt.get('e.expression'))
        }
        break;
      default:
        // Most of cases end up here - dont log here
        break;
    }
  }

  // for each job get all execution statements 
  for (let i = 0; i < jobs.length; i++) {
    const behaviorList = await neo4jInterface.queryNodes(getJobSWBehaviorNamesOf(packageRoot, jobs[i].name));
    if (!behaviorList) {
      throw new Error("Could not retrieve job behavior list from DB.");
    }

    for (const behavior of behaviorList) {
      const behaviorName: string = behavior.get('b.name');
      const stmts = await neo4jInterface.queryNodes(getJobSWBehaviorStatementsOf(packageRoot, jobs[i].name, behaviorName));
      if (!stmts?.length) continue;

      switch (behaviorName) {
        case JobBehaviorKeyword.checkOut:
          if (!stmts?.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            const name: string = stmt.get('b.key');
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            // If has attribute name -> set
            if (name?.length) jobs[i].checkout.set('name', name);
            // If has pathX => value -> set
            if (key?.length && val?.length) jobs[i].checkout.set(key, val);
          }
          break;
        case JobBehaviorKeyword.stage:
          // Job belongs to stage (GL)
          if (!stmts?.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            jobs[i].stage = stmt.get('e.expression');
            // Stop - job belongs to only one stage
            break;
          }
          break;
        // execution script commands
        case JobBehaviorKeyword.exec:
          if (!stmts?.length) break;
          // Order is critical for the commands
          // let cmds = new Map<string, string>();
          for (const stmt of stmts) {
            if (!stmt) continue;
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            // cmd0, cmd1, cmd2...
            if (!key?.length && !key.match(/^cmd[0-9]$/g)) throw new Error("ExecutionScipt Command name: '${key}' not in proper format: cmdX.");
            if (key?.length && val?.length) jobs[i].commands.set(key, val);
          }
          // jobs[i].commands.push(stmts.get('e.expression'));
          break;
        // dependencies
        case JobBehaviorKeyword.deps:
          // Dependencies are optional - skip  if no statements
          if (!stmts.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            jobs[i].dependencies.push(stmt.get('e.expression'));
          }
          break;
        // permission 
        case JobBehaviorKeyword.perms:
          // Permissions are optional - skip if no statements
          if (!stmts.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            jobs[i].permissions.set(stmt.get('e.name'), stmt.get('e.expression'));
          }
          break;
        // container image 
        case JobBehaviorKeyword.img:
          if (!stmts.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            if (key?.length) {
              jobs[i].image.set(key, val);
            }
          }
          break;
        case JobBehaviorKeyword.buildArtifact:
          // Build artifact is optional - skip if no statements
          if (!stmts.length) break;
          jobs[i].upArtifactPaths = [];
          for (const stmt of stmts) {
            if (!stmt) continue;
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            // build artifact pathX
            if (key.startsWith('path')) {
              jobs[i].upArtifactPaths.push(val);
            }
            else if (key.startsWith('exclude')) {
              jobs[i].upArtifactExcludes.push(val);
            }
            // artifact general properties
            else {
              jobs[i].upArtifact.set(key, val);
            }
          }
          break;
        case JobBehaviorKeyword.dlArtifact:
          // Download artifact is optional - skip if no statements
          if (!stmts.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            jobs[i].downArtifact.set(key, val);
          }
          break;
        case JobBehaviorKeyword.env:
          // Environment is optional - skip if no statements
          if (!stmts.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            jobs[i].environment.set(key, val);
          }
          break;
        case JobBehaviorKeyword.release:
          // Environment is optional - skip if no statements
          if (!stmts.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            if (key.startsWith('path')) {
              jobs[i].releasePaths.push(val);
            } else {
              jobs[i].release.set(key, val);
            }
          }
          break;
        case JobBehaviorKeyword.report:
          if (!stmts.length) break;
          for (const stmt of stmts) {
            if (!stmt) continue;
            const key: string = stmt.get('e.name');
            const val: string = stmt.get('e.expression');
            if (key == "when") {
              jobs[i].upArtifact.set(key, val);
            }
            else if (key == "untracked") {
              jobs[i].upArtifact.set(key, val);
            }
            else {
              jobs[i].reportArtifact.set(key, val);
            }
          }
          break;
        default:
          // setLibrarySOMELIBNAME
          if (behaviorName.startsWith(JobBehaviorKeyword.library)) {
            if (!stmts.length) break;
            for (const stmt of stmts) {
              if (!stmt) continue;
              const lname = stmt?.get('b.key');
              const lver = stmt.get('b.version');
              // param name
              const key: string = stmt.get('e.name');
              // param value
              const val: string = stmt.get('e.expression');
              // lib data
              let mapp: Map<string, string> = jobs[i].libraries.find(p => (p?.get('id') ?? '') == behaviorName) ?? new Map<string, string>();
              if (!mapp?.size) jobs[i].libraries.push(mapp);
              mapp?.set('id', behaviorName);
              if (lname?.length) mapp.set('lib_name', lname);
              if (lver?.length) mapp.set('lib_version', lver);
              if (key?.length && val?.length) mapp.set(key, val);
            }
            break;
          }
          // cache key + paths
          // setCacheSOMECACHENAME
          else if (behaviorName.startsWith(JobBehaviorKeyword.cache)) {
            // Cache is optional - skip if no statements
            if (!stmts?.length) break;
            let hasKey: boolean = false;
            for (const stmt of stmts) {
              if (!stmt) continue;
              const key: string = stmt.get('b.key');
              const name: string = stmt.get('e.name');
              const val: string = stmt.get('e.expression');
              let mapp: Map<string, string | string[]> = jobs[i].caches.find(p => (p?.get('id') ?? '') == behaviorName) ?? new Map<string, string | string[]>();
              if (!mapp?.size) jobs[i].caches.push(mapp);
              mapp?.set('id', behaviorName);
              if (!mapp.has('paths')) mapp.set('paths', [])
              // Customattribute key
              if (key?.length) {
                mapp.set('key', key);
                // jobs[i].cacheKey = key;
                hasKey = true;
              }
              // statement when: ...
              if (name?.length && name == 'when' && val?.length) {
                mapp.set('when', val);               
              }
              // statement when: ...
              else if (name?.length && name == 'untracked' && val?.length) {
                mapp.set('untracked', val);               
              }
              // statement pathX
              else if (name?.length && name.startsWith('path') && val?.length) {
                (mapp?.get('paths') as string[]).push(val);
                // jobs[i].cachePaths.push(val);
              }
              if (!hasKey) throw new Error(`Cache key could not be parsed from the model for job '${jobs[i].name}'. Ensure customAttribute key = ... exist in behavior setCache {...}`);
            }
            break;
          }

          // Do not log here - most cases end up here
          break;
      }
    }
  }

  // console.log(globalConfig);
  // console.log(jobs);

  // create script string for each job
  let serializedJobs: string[] = []

  if (targetPlatform == 'gitlab') {
    // serialize global name 
    serializedJobs.push(serGlobalNameGitlab(globalConfig));

    // serialize stages list for jobs
    serializedJobs.push(serStageListGitlab(jobs));

    // serialize global variables
    serializedJobs.push(serVariableListGitlab(globalConfig));

    // serialize all jobs
    for (let job of jobs.reverse()) {
      serializedJobs.push(serJobGitLab(job, globalConfig));
    }

    // Parse special variables for GitLab
    for (let i = 0; i < serializedJobs.length; i++) {
      serializedJobs[i] = parseSpecialVariablesGitlab(serializedJobs[i]);
    }

  } else if (targetPlatform == 'github') {
    // serialize global name
    serializedJobs.push(serGlobalNameGithub(globalConfig));

    // serialize triggers configuration github
    serializedJobs.push(serTriggersGithub(globalConfig));

    // serialize global pipeline permissions
    serializedJobs.push(serGlobalPermsGithub(globalConfig));

    // serialize global variables
    serializedJobs.push(serVariableListGithub(globalConfig));

    // serialize all jobs
    let header: boolean = true;
    for (let job of jobs.reverse()) {
      serializedJobs.push(serJobGithub(header, job, globalConfig));
      header = false;
    }

    // Parse special variables for GitHub
    for (let i = 0; i < serializedJobs.length; i++) {
      serializedJobs[i] = parseSpecialVariablesGithub(serializedJobs[i]);
    }

  } else {
    // unsupported target platform - cleanup and return
    console.error('ERROR: target ' + targetPlatform + ' not supported. Available platforms: [ gitlab | github ]');
    neo4jInterface.closeDriver();
    throw new Error('Projector execution failed.');
  }

  serializedJobs.push(''); // Ensure newline at end of file

  // close driver as we are done
  neo4jInterface.closeDriver();

  // store cicd script to file
  writeFileSync(outputFileName, serializedJobs.join('\n\n'));

  return;
}
