import React, { useState } from 'react';
import { GitBranch, Terminal, Copy, Check, CheckCircle2, AlertCircle, ArrowUpRight, Zap, RefreshCw, KeyRound, ExternalLink, ShieldCheck } from 'lucide-react';
import { FIRMWARE_FILES } from '../data/firmwareCode.ts';

export const GitHubPushSection: React.FC<{ onGoToFirmware: () => void }> = ({ onGoToFirmware }) => {
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState('esp32s3-wifi-audio-receiver');
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [createdRepoUrl, setCreatedRepoUrl] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  // Direct GitHub API Push from Browser
  const handleDirectPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setPushStatus('error');
      setStatusMessage('Please enter your GitHub Personal Access Token (classic or fine-grained with repo access).');
      return;
    }

    setIsPushing(true);
    setPushStatus('pushing');
    setStatusMessage('Authenticating with GitHub API...');

    try {
      // 1. Get authenticated user login
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userRes.ok) {
        throw new Error('Invalid GitHub token. Please verify your token has "repo" permissions.');
      }

      const userData = await userRes.json();
      const username = userData.login;
      setStatusMessage(`Authenticated as @${username}. Creating repository '${repoName}'...`);

      // 2. Create or verify repo
      let targetRepo = repoName.trim();
      const createRepoRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: targetRepo,
          description: 'ESP32-S3 N16R8 WiFi Audio Receiver with FreeRTOS & UDA1334A DAC (Automated merged.bin CI)',
          private: false,
          auto_init: false,
        }),
      });

      if (createRepoRes.status === 422) {
        // Repo might already exist, which is fine
        setStatusMessage(`Repository '${targetRepo}' exists. Preparing commits...`);
      } else if (!createRepoRes.ok) {
        const err = await createRepoRes.json();
        throw new Error(err.message || 'Failed to create repository');
      }

      const repoUrl = `https://github.com/${username}/${targetRepo}`;
      setCreatedRepoUrl(repoUrl);

      // 3. Upload each file directly via GitHub Contents API
      for (let i = 0; i < FIRMWARE_FILES.length; i++) {
        const file = FIRMWARE_FILES[i];
        setStatusMessage(`Committing ${file.filename} (${i + 1}/${FIRMWARE_FILES.length})...`);

        // Check if file exists to get SHA for update
        let sha: string | undefined;
        try {
          const getFileRes = await fetch(`https://api.github.com/repos/${username}/${targetRepo}/contents/${file.filename}`, {
            headers: {
              Authorization: `token ${token.trim()}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });
          if (getFileRes.ok) {
            const fileData = await getFileRes.json();
            sha = fileData.sha;
          }
        } catch {
          // New file
        }

        // Base64 encode file content safely
        const base64Content = btoa(unescape(encodeURIComponent(file.content)));

        const putRes = await fetch(`https://api.github.com/repos/${username}/${targetRepo}/contents/${file.filename}`, {
          method: 'PUT',
          headers: {
            Authorization: `token ${token.trim()}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `ci: add ${file.filename} for automatic merged.bin build`,
            content: base64Content,
            sha: sha,
          }),
        });

        if (!putRes.ok) {
          const putErr = await putRes.json();
          throw new Error(`Failed to commit ${file.filename}: ${putErr.message}`);
        }
      }

      setPushStatus('success');
      setStatusMessage(`All files pushed to @${username}/${targetRepo}! GitHub Actions CI has started.`);
    } catch (err: any) {
      console.error(err);
      setPushStatus('error');
      setStatusMessage(err.message || 'Push failed. Please check network and permissions.');
    } finally {
      setIsPushing(false);
    }
  };

  const flashCommand = `esptool.py --chip esp32s3 -b 921600 write_flash 0x0 merged.bin`;

  return (
    <div className="space-y-8">
      {/* Direct Push Card */}
      <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-6 lg:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Direct 1-Click Browser-to-GitHub Push</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Push Directly to GitHub &amp; Trigger Actions Build
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Paste your GitHub token below. This pushes all C++ firmware, PlatformIO configs, and the GitHub Actions CI workflow straight to your repository without opening a terminal!
            </p>
          </div>

          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=ESP32-Audio-CI-Builder"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/80 rounded-lg hover:bg-cyan-900/50 transition-colors"
          >
            <span>Get GitHub Token (with 'repo' scope)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* The Direct Push Form */}
        <form onSubmit={handleDirectPush} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                Repository Name
              </label>
              <input
                type="text"
                required
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="esp32s3-wifi-audio-receiver"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                GitHub Personal Access Token (classic or fine-grained)
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
                <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="text-[11px] text-slate-500 font-mono">
              Tokens are never stored or logged. They call the official api.github.com directly.
            </div>

            <button
              type="submit"
              disabled={isPushing}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg transition-colors disabled:opacity-40"
            >
              {isPushing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Pushing to GitHub...</span>
                </>
              ) : (
                <>
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Push to GitHub &amp; Start Build Now</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Status Feedback Banner */}
        {pushStatus !== 'idle' && (
          <div
            className={`p-4 rounded-xl border text-xs font-mono flex items-start gap-3 ${
              pushStatus === 'pushing'
                ? 'bg-cyan-950/40 border-cyan-800 text-cyan-300'
                : pushStatus === 'success'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}
          >
            {pushStatus === 'pushing' && <RefreshCw className="w-4 h-4 animate-spin shrink-0 mt-0.5" />}
            {pushStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {pushStatus === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}

            <div className="flex-1 space-y-2">
              <div>{statusMessage}</div>
              {pushStatus === 'success' && createdRepoUrl && (
                <div className="pt-2 flex items-center gap-3">
                  <a
                    href={`${createdRepoUrl}/actions`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded-md hover:bg-emerald-400 transition-colors shadow-md text-xs"
                  >
                    <span>Click here to watch GitHub Actions Build Live</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Flashing merged.bin Quick Reference */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Flashing the Built merged.bin
          </span>
          <button
            onClick={() => copyToClipboard(flashCommand, 'flash')}
            className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
          >
            {copiedCmd === 'flash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedCmd === 'flash' ? 'Copied!' : 'Copy Flash Command'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Once the GitHub Action completes in your repo, download the <code className="text-cyan-400 font-mono">esp32-s3-firmware-binaries</code> artifact and flash it directly at address <strong className="text-amber-300">0x0</strong>:
        </p>

        <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-amber-300 overflow-x-auto">
          <code>{flashCommand}</code>
        </div>
      </div>
    </div>
  );
};
