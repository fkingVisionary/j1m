// Provenance — every grade can say WHY it was produced and WHICH versions made it.
// Required by the "provenance on every grade" principle and the dispute/debug workflow.

export const PIPELINE_VERSION = "v0.8.0";
export const CALIBRATION_VERSION = "hardcoded-v0"; // hardcoded ladder; replaced later by harvested TAG medians

export interface CallRecord {
  stage: string;
  prompt: string;
  version: string;
  model: string;
  costUSD: number;
  cached: boolean;
  ok: boolean;
}

export interface Provenance {
  pipelineVersion: string;
  calibrationVersion: string;
  depth: string;
  promptVersions: Record<string, string>;
  modelPerCall: Record<string, string>;
  costUSD: number;
  calls: CallRecord[];
}

export class ProvenanceBuilder {
  private calls: CallRecord[] = [];
  constructor(private depth: string) {}

  record(rec: CallRecord): void {
    this.calls.push(rec);
  }

  build(): Provenance {
    const promptVersions: Record<string, string> = {};
    const modelPerCall: Record<string, string> = {};
    let costUSD = 0;
    for (const c of this.calls) {
      promptVersions[c.prompt] = c.version;
      modelPerCall[c.stage] = c.model;
      costUSD += c.costUSD;
    }
    return {
      pipelineVersion: PIPELINE_VERSION,
      calibrationVersion: CALIBRATION_VERSION,
      depth: this.depth,
      promptVersions,
      modelPerCall,
      costUSD: +costUSD.toFixed(6),
      calls: this.calls.slice(),
    };
  }
}
