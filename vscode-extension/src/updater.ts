import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';

/** owner/repo whose GitHub Releases host the published .vsix files. */
const REPO = 'bowermandw/sql-format';

const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`;

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

const LAST_CHECK_KEY = 'sqlFormat.lastUpdateCheck';
const SKIPPED_VERSION_KEY = 'sqlFormat.skippedVersion';

const USER_AGENT = 'sql-format-vscode-updater';

interface ReleaseAsset {
  name: string;
  url: string;
}

interface LatestRelease {
  version: string;     // tag_name with any leading "v" stripped
  htmlUrl: string;
  asset: ReleaseAsset | undefined;
}

/**
 * Register the manual "Check for Updates" command and kick off the throttled
 * automatic check. Safe to call once from `activate`; never throws.
 */
export function registerAutoUpdate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sqlFormat.checkForUpdates', () =>
      checkForUpdates(context, { manual: true })
    )
  );

  // Fire-and-forget; the automatic path is silent on "up to date" and on errors.
  void maybeAutoCheck(context);
}

/**
 * Run an automatic check at most once per `CHECK_INTERVAL_MS`, and only when the
 * `sqlFormat.checkForUpdates` setting is enabled.
 */
async function maybeAutoCheck(context: vscode.ExtensionContext): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('sqlFormat')
    .get<boolean>('checkForUpdates');
  if (enabled === false) {
    return;
  }

  const last = context.globalState.get<number>(LAST_CHECK_KEY) ?? 0;
  if (Date.now() - last < CHECK_INTERVAL_MS) {
    return;
  }

  await context.globalState.update(LAST_CHECK_KEY, Date.now());
  await checkForUpdates(context, { manual: false });
}

/**
 * Fetch the latest release, compare to the installed version, and prompt to
 * update when a newer one exists. In automatic mode this is silent unless an
 * update is available; the manual command surfaces "up to date" and errors and
 * ignores the skipped-version state.
 */
async function checkForUpdates(
  context: vscode.ExtensionContext,
  { manual }: { manual: boolean }
): Promise<void> {
  const current = getInstalledVersion(context);

  let release: LatestRelease;
  try {
    release = await fetchLatestRelease();
  } catch (err) {
    if (manual) {
      vscode.window.showErrorMessage(
        `sql-format: could not check for updates — ${errorMessage(err)}`
      );
    }
    return;
  }

  if (!isNewer(release.version, current)) {
    if (manual) {
      vscode.window.showInformationMessage(
        `sql-format: you're on the latest version (${current}).`
      );
    }
    return;
  }

  if (!manual && context.globalState.get<string>(SKIPPED_VERSION_KEY) === release.version) {
    return;
  }

  await promptUpdate(context, release, current);
}

async function promptUpdate(
  context: vscode.ExtensionContext,
  release: LatestRelease,
  current: string
): Promise<void> {
  const canInstall = isInstallSupported() && !!release.asset;

  const updateAction = 'Update';
  const notesAction = 'Release Notes';
  const skipAction = 'Skip This Version';
  const actions = canInstall
    ? [updateAction, notesAction, skipAction]
    : [notesAction, skipAction];

  const choice = await vscode.window.showInformationMessage(
    `sql-format: version ${release.version} is available (you have ${current}).`,
    ...actions
  );

  if (choice === notesAction) {
    void vscode.env.openExternal(vscode.Uri.parse(release.htmlUrl || RELEASES_PAGE_URL));
    return;
  }

  if (choice === skipAction) {
    await context.globalState.update(SKIPPED_VERSION_KEY, release.version);
    return;
  }

  if (choice === updateAction && canInstall) {
    await downloadAndInstall(context, release);
  }
}

/**
 * Download the release's .vsix into global storage, install it via the built-in
 * command, and offer to reload. On any failure, reveal the downloaded file and
 * tell the user how to install it manually.
 */
async function downloadAndInstall(
  context: vscode.ExtensionContext,
  release: LatestRelease
): Promise<void> {
  const asset = release.asset!;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `sql-format: updating to ${release.version}…`,
      cancellable: false,
    },
    async progress => {
      let dest: string;
      try {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        await cleanStaleVsix(context, asset.name);
        dest = vscode.Uri.joinPath(context.globalStorageUri, asset.name).fsPath;

        progress.report({ message: 'downloading…' });
        await downloadToFile(asset.url, dest, { 'User-Agent': USER_AGENT });

        const stat = fs.statSync(dest);
        if (!stat.size) {
          throw new Error('downloaded file is empty');
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `sql-format: download failed — ${errorMessage(err)}`
        );
        return;
      }

      try {
        progress.report({ message: 'installing…' });
        await vscode.commands.executeCommand(
          'workbench.extensions.installExtension',
          vscode.Uri.file(dest)
        );
      } catch (err) {
        await offerManualInstall(dest, err);
        return;
      }

      const reloadAction = 'Reload Now';
      const choice = await vscode.window.showInformationMessage(
        `sql-format: version ${release.version} installed. Reload to activate.`,
        reloadAction
      );
      if (choice === reloadAction) {
        void vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    }
  );
}

async function offerManualInstall(dest: string, err: unknown): Promise<void> {
  const revealAction = 'Show File';
  const choice = await vscode.window.showWarningMessage(
    `sql-format: automatic install failed (${errorMessage(err)}). ` +
      'The downloaded .vsix was saved — install it via "Extensions: Install from VSIX…".',
    revealAction
  );
  if (choice === revealAction) {
    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dest));
  }
}

/** Remove any previously downloaded .vsix files except the one we're about to use. */
async function cleanStaleVsix(
  context: vscode.ExtensionContext,
  keepName: string
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(context.globalStorageUri);
  } catch {
    return;
  }
  for (const [name] of entries) {
    if (name !== keepName && name.endsWith('.vsix')) {
      try {
        await vscode.workspace.fs.delete(
          vscode.Uri.joinPath(context.globalStorageUri, name)
        );
      } catch {
        // best-effort cleanup
      }
    }
  }
}

async function fetchLatestRelease(): Promise<LatestRelease> {
  const data = await httpGetJson(LATEST_RELEASE_URL, {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });

  const version = String(data.tag_name ?? '').replace(/^v/, '');
  if (!version) {
    throw new Error('release response had no tag_name');
  }

  const assets: ReleaseAsset[] = Array.isArray(data.assets)
    ? data.assets.map((a: any) => ({ name: String(a.name), url: String(a.browser_download_url) }))
    : [];
  const asset =
    assets.find(a => a.name === `sql-format-vscode-${version}.vsix`) ??
    assets.find(a => a.name.endsWith('.vsix'));

  return { version, htmlUrl: String(data.html_url ?? ''), asset };
}

/** GET a URL as JSON, following redirects and rejecting on non-2xx. */
function httpGetJson(
  url: string,
  headers: Record<string, string>,
  redirectsLeft = MAX_REDIRECTS
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (isRedirect(status) && location) {
        if (redirectsLeft <= 0) {
          reject(new Error('too many redirects'));
          res.resume();
          return;
        }
        res.resume();
        // Send only User-Agent across hosts; drop GitHub-specific headers.
        httpGetJson(location, { 'User-Agent': headers['User-Agent'] }, redirectsLeft - 1)
          .then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        reject(new Error(`HTTP ${status} from ${url}`));
        res.resume();
        return;
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`invalid JSON response: ${errorMessage(e)}`));
        }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
  });
}

/** Download a URL to `destPath`, following redirects. */
function downloadToFile(
  url: string,
  destPath: string,
  headers: Record<string, string>,
  redirectsLeft = MAX_REDIRECTS
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (isRedirect(status) && location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('too many redirects'));
          return;
        }
        downloadToFile(location, destPath, { 'User-Agent': headers['User-Agent'] }, redirectsLeft - 1)
          .then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        reject(new Error(`HTTP ${status} from ${url}`));
        res.resume();
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(err => (err ? reject(err) : resolve())));
      file.on('error', err => {
        fs.unlink(destPath, () => reject(err));
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
  });
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * True when `latest` is a newer MAJOR.MINOR.PATCH triple than `current`.
 * Returns false on any malformed component so a bad tag never triggers an update.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseTriple(latest);
  const b = parseTriple(current);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function parseTriple(version: string): [number, number, number] | undefined {
  const parts = version.replace(/^v/, '').split('.');
  const nums: number[] = [];
  for (let i = 0; i < 3; i++) {
    const n = Number(parts[i] ?? 0);
    if (!Number.isFinite(n)) {
      return undefined;
    }
    nums.push(n);
  }
  return [nums[0], nums[1], nums[2]];
}

/** In-process install only works on a local desktop host. */
function isInstallSupported(): boolean {
  return vscode.env.uiKind === vscode.UIKind.Desktop && !vscode.env.remoteName;
}

function getInstalledVersion(context: vscode.ExtensionContext): string {
  return String(context.extension.packageJSON.version ?? '0.0.0');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
