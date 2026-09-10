# Development-branch recovery audit

## Scope and verified starting point

On 2026-09-10, upstream `main` was `eac4a97da00f490e0a9123869f68ea5e1cf25cca` and `feat/cad-kernel-interchange-drafting` was `42e298092e046262b484d5a57607428240141ab2`. Pull request #1 reconciles that branch with the working 0.2 application and retains its history with a merge commit.

**The previously described advanced CAD implementation did not reach the repository and is not present in the preserved source archives. This merge does not deliver or claim those missing features.**

Before recovery fixes, the branch had 13 commits and changed exactly eight paths relative to `main`:

- `.github/workflows/cad-archive-oracle.yml`
- `.github/workflows/cad-format-fixtures.yml`
- `.github/workflows/cad-sdk.yml`
- `.github/workflows/cad-verify.yml`
- `.github/workflows/import-cad-source.yml`
- `.github/workflows/pages.yml`
- `tests/cad-ci-report.txt`
- `tests/kernel-api-report.txt`

No application source, geometry kernel, drafting UI, native-format codec, plugin runtime, or GPU tessellation integration was added on that branch. No `_bootstrap/manifest.json` or source-transport parts were present. The source-import workflow alone is not an implementation.

## Preserved artifacts examined

`RECOVERY-ARTIFACTS.json` records exact sizes and SHA-256 digests of the archives examined. Their contents are:

| Artifact | Recoverable contents |
| --- | --- |
| `Veldra3D-source.zip` | Earlier 0.1 application source and documentation |
| `veldra-kernel-sdk.zip` | Working 0.2 source plus development-only library packages; no later CAD extension |
| `veldra-extended-sdk.zip` | Additional development library packages; no Veldra CAD implementation |
| `cad-verification.zip` | Historical core-test report and dependency API inventory |
| `native-format-fixtures.zip` | Licensed third-party graph fixtures and a development-only serialization SDK; not a Veldra codec |
| `native-archive-oracle.zip` | Public-API-generated serialization samples, generator source, and API inventory; not an app implementation |

The remaining `Veldra3D-next/docs/cad-drafting.png` attachment is a screenshot, not recoverable source or executable verification. It must not be presented as a capability of this merged build. No proprietary SDK binaries or unnecessary library bundles are copied into the application by this merge. Existing SDK and fixture preparation workflows are preserved for reproducible development.

## Integration repairs

The unfinished branch's deployment referenced absent `vendor:cad`, `tools/verify-cad.sh`, `tools/native-archive-fixtures.mjs`, and `tests/NativeArchiveVerify.cs`. Merging those workflows unchanged would break both CI and publication.

The repaired workflows run the real committed application suite through `tools/verify-app.sh`: core tests, standalone and project-prefixed modeling, CPU-worker final rendering, and required actual WebGPU path tracing. WebGPU failure fails the application gate; it is never turned into a passing fallback test.

`tools/check-cad-availability.mjs` reports wholly absent extensions as **unavailable**, rejects partial entrypoint uploads, and enables the preserved dedicated CAD/native-reader jobs only when their required files exist. A skipped extension job is not a successful compatibility test. The actual application job is always required by the workflow. Five regression tests cover the availability gate.

PR jobs are read-only. The deployment guards against publishing non-main or obsolete checkouts, commits regenerated evidence without force-pushing, and stages the site with its exact source commit in `build-info.json`. Existing application code and the final-render engine are retained unchanged.

## Remaining source gap

The following previously described work cannot be recovered from these artifacts: advanced B-rep/fillet integration, STEP/IGES integration, native archive compatibility, drafting/associative dimensions, additional geometry workers, integrated GPU surface tessellation, and the additional plugin runtime. These remain unmerged/unimplemented in this repository until actual source is supplied or implemented again. A screenshot, dependency inventory, green baseline test, or merged infrastructure PR does not close this gap.

The current application capabilities remain those documented in `CAPABILITIES.md` and `FINAL-RENDERING.md`. Historical test reports are not new verification results; the PR and deployment artifacts identify the results of this recovery pass.
