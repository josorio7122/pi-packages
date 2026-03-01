import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import * as path from 'node:path';
import { registerInitTool } from './tools/init.js';
import { registerStateTool } from './tools/state.js';
import { registerPhaseTool } from './tools/phase.js';
import { registerRoadmapTool } from './tools/roadmap.js';
import { registerConfigTool } from './tools/config.js';
import { registerMilestoneTool } from './tools/milestone.js';
import { registerVerifyTool } from './tools/verify.js';
import { registerUtilTool } from './tools/util.js';
import { registerDispatchTool } from './tools/dispatch.js';
import { registerDispatchWaveTool } from './tools/dispatch-wave.js';
import { registerContextMonitor } from './hooks/context-monitor.js';
import { registerStatusline } from './hooks/statusline.js';

export default function (pi: ExtensionAPI): void {
  const extensionDir = path.dirname(new URL(import.meta.url).pathname);
  const packageRoot = path.resolve(extensionDir, '../..');
  const runtimeDir = path.join(packageRoot, 'runtime');
  const agentsDir = path.join(packageRoot, 'agents');

  // Set environment variable for skills to reference
  process.env.GSD_RUNTIME_PATH = runtimeDir;

  // State / operations tools (8)
  registerInitTool(pi);
  registerStateTool(pi);
  registerPhaseTool(pi);
  registerRoadmapTool(pi);
  registerConfigTool(pi);
  registerMilestoneTool(pi);
  registerVerifyTool(pi);
  registerUtilTool(pi, runtimeDir);

  // Dispatch tools (2)
  registerDispatchTool(pi, agentsDir);
  registerDispatchWaveTool(pi, agentsDir);

  // Hooks
  registerContextMonitor(pi);
  registerStatusline(pi);
}
