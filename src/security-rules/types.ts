import type {
  Confidence,
  FindingCategory,
  FindingClassification,
  Severity,
} from '../contracts';

export type Language =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'php'
  | 'ruby'
  | 'shell'
  | 'powershell'
  | 'batch'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'c'
  | 'cpp'
  | 'rust'
  | 'swift'
  | 'perl'
  | 'lua'
  | 'html'
  | 'vue'
  | 'yaml'
  | 'json'
  | 'toml'
  | 'xml'
  | 'dockerfile'
  | 'terraform'
  | 'sql'
  | 'markdown'
  | 'text'
  | 'config'
  | 'other';

/** Static description of a rule. Every field is shown in reports and in docs/SECURITY_RULES.md. */
export interface RuleMeta {
  id: string;
  name: string;
  description: string;
  category: FindingCategory;
  severity: Severity;
  confidence: Confidence;
  languages: Language[] | 'any';
  /** Human-readable explanation of the matching logic. */
  matching: string;
  falsePositiveGuidance: string;
  remediation: string;
  references: string[];
  /** Default classification when the rule fires in production code. */
  classification: FindingClassification;
}

export interface FileContext {
  /** POSIX path relative to scan root. */
  path: string;
  content: string;
  lines: string[];
  language: Language;
  isTestOrExample: boolean;
  isDocumentation: boolean;
  isMinified: boolean;
  isGenerated: boolean;
}

/** A raw rule hit before normalization. */
export interface RuleHit {
  ruleId: string;
  line: number | null;
  endLine?: number | null;
  /** The text used as evidence; will be masked/truncated before leaving the engine. */
  evidence: string | null;
  /** Override rule defaults when context changes the assessment. */
  severity?: Severity;
  confidence?: Confidence;
  classification?: FindingClassification;
  title?: string;
  extraDescription?: string;
  /** Stable text used for fingerprinting (defaults to trimmed evidence). */
  fingerprintKey?: string;
  metadata?: Record<string, unknown>;
  packageName?: string;
  packageVersion?: string;
  packageEcosystem?: string;
  /** For secret findings: the exact secret value, used ONLY for masking. Never persisted. */
  secretValue?: string;
}

export interface CodeRule extends RuleMeta {
  /** Optional cheap pre-filter on path. */
  appliesToPath?: (path: string) => boolean;
  analyze(ctx: FileContext): RuleHit[];
}
