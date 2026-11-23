<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { InternalError } from "@typeprompt/core";

interface ExampleTab {
  label: string;
  path: string;
  initialCode: string;
}

const WORKSPACE_FILES = {
  "meta.tp": `<meta>
  interface Meta {
    model: "gpt-4o" | "gpt-4o-mini";
    /** Sampling temperature (0-2). */
    temperature?: number;
  }
</meta>`,
  "webSearch.tp": `<tool name="webSearch">
  <description>
    Search the web and return a list of relevant results. Each result has a
    <c>title</c>, <c>url</c>, and a short <c>snippet</c>.
  </description>

  <schema>
    interface Input {
      query: string;
    }

    interface Output {
      results: {
        title: string;
        url: string;
        snippet: string;
      }[];
    }
  </schema>
</tool>`,
};

const TABS: ExampleTab[] = [
  {
    label: "Simple",
    path: "DecodeCatMood.tp",
    initialCode: `<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    // Variables provided to render the prompt
    interface Input {
      catAction: string;
      bowlStatus: "empty" | "half-empty";
    }

    // Structured JSON response expected from the model
    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      urgency: "chill" | "crisis";
      /** What the human servant must immediately do. */
      humanAction: string;
    }
  </schema>

  <system>
    You are an expert feline behavior interpreter.
    Decode cat actions into their true demands.
  </system>

  <user>
    <insert val="input" format="yaml" />
  </user>

  <examples>
    - input:
        catAction: Yowl at 3am
        bowlStatus: half-empty
      output:
        demand: feed-me
        urgency: crisis
        humanAction: Shake the bowl to cover the bottom.
  </examples>
</template>`,
  },
  {
    label: "Complex types",
    path: "GeneratePageTree.tp",
    initialCode: `<template name="GeneratePageTree">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    type Input = {
      providers: Provider[];
      /** The use case this comparison should be framed around. */
      useCase: string;
      /** Target audience for the page. */
      audience: "developer" | "architect" | "businessDecisionMaker";
    };

    type Provider = {
      name: string;
      region: string;
      category: ProductCategory;
      pricing: Pricing;
      benchmarks: Benchmark[];
      pros: string[];
      cons: string[];
    };

    type ProductCategory = "storage" | "compute" | "database" | "networking";

    type Pricing = {
      model: "perHour" | "perMonth" | "perRequest";
      basePrice: number;
      /** Price per additional unit beyond the base tier, if applicable. */
      overage?: number;
    };

    type Benchmark = {
      name: string;
      score: number;
      unit: string;
    };

    type Output = {
      root: PageNode;
    };

    /** A node in the rendered page tree. */
    type PageNode =
      | {
          kind: "heading";
          level: "h1" | "h2" | "h3";
          text: string;
        }
      | {
          kind: "paragraph";
          text: string;
        }
      | {
          kind: "button";
          label: string;
          /** Destination URL or action target. */
          url: string;
        }
      | {
          kind: "section";
          title?: string;
          children: PageNode[];
        };
  </schema>

  <system>
    You are a UI layout generator. Given provider benchmarks, pricing, and a target
    use case, generate a comparison page layout represented as a hierarchy of
    page nodes.

    - Use <c>"section"</c> nodes to group related elements under a logical container.
    - Start with a top-level <c>"heading"</c> with <c>level</c> <c
      >"h1"</c> or wrap the page in a root <c>"section"</c>.
    - Use <c>"paragraph"</c> nodes for descriptive analysis tailored to the target <c
      >audience</c>.
    - Add <c>"button"</c> nodes for relevant calls to action.
  </system>

  <user>
    Generate a comparison page layout framed around this use case: <insert
        val="input.useCase"
      />

    Target audience: <insert val="input.audience" />

    Here is the data for each provider:

    <insert val="input.providers" format="toon" />
  </user>

  <examples>
    - input:
        useCase: serving ML inference workloads
        audience: architect
        providers:
          - name: CloudX
            region: us-east
            category: compute
            pricing:
              model: perHour
              basePrice: 0.1
            benchmarks:
              - name: throughput
                score: 1000
                unit: rps
            pros:
              - fast
              - reliable
            cons:
              - pricey
      output:
        root:
          kind: section
          title: "Cloud Provider Comparison: ML Inference"
          children:
            - kind: heading
              level: h1
              text: Cloud Infrastructure Comparison
            - kind: paragraph
              text: >-
                An architectural evaluation of compute providers optimized
                for real-time machine learning inference.
            - kind: section
              title: CloudX Overview
              children:
                - kind: paragraph
                  text: >-
                    CloudX delivers 1000 rps throughput in us-east at
                    $0.10/hour, ideal for high-throughput low-latency
                    inference.
                - kind: button
                  label: View Benchmark Details
                  url: https://example.com/benchmarks/cloudx
  </examples>
</template>`,
  },
  {
    label: "Tools",
    path: "ResearchQuestion.tp",
    initialCode: `<template name="ResearchQuestion">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      question: string;
    }

    interface Output {
      answer: string;
      /** URLs of sources used. */
      sources: string[];
    }
  </schema>

  <tools>
    <tool name="webSearch" />
  </tools>

  <system>
    You are a research assistant. Use the <c>webSearch</c> tool to find
    up-to-date information, then provide a concise, well-sourced answer.
    Always cite the URLs you relied on.
  </system>

  <user>
    <insert val="input.question" />
  </user>

  <examples>
    - input:
        question: What is the current population of Tokyo?
      steps:
        - toolCalls:
            - callId: s1
              tool: webSearch
              input:
                query: Tokyo population 2024
              output:
                results:
                  - title: Tokyo Metropolitan Government
                    url: https://www.metro.tokyo.lg.jp/english/
                    snippet: As of 2024, the population of Tokyo is approximately 13.96 million.
      output:
        answer: As of 2024, Tokyo's population is approximately 13.96 million.
        sources:
          - https://www.metro.tokyo.lg.jp/english/
  </examples>
</template>`,
  },
  {
    label: "Variants",
    path: "WriteProductDescription.tp",
    initialCode: `<template name="WriteProductDescription">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      // Selects the prompt variation.
      // Union members must match the variant 'case' attributes below.
      variant: "marketing" | "technical" | "brief";
      productName: string;
      features: string[];
    }

    interface Output {
      description: string;
    }
  </schema>

  <!-- Shared user message: same for all variants -->
  <user>
    Product: <insert val="input.productName" />
    Features: <insert val="input.features" format="json" />
  </user>

  <variant case="marketing">
    <system>
      Write an engaging, benefit-focused product description for a marketing
      website. Lead with the customer's problem, then present the product as
      the solution. Use vivid, persuasive language. Keep it to 2–3 sentences.
    </system>
    <examples>
      - input:
          productName: AquaFilter Pro
          features:
            ["removes 99.9% of contaminants", "lasts 6 months", "easy installation"]
          # variant field must be omitted when inside a variant tag
        output:
          description: >
            Tired of worrying about what's in your tap water? AquaFilter Pro
            eliminates 99.9% of contaminants, so your family drinks nothing but
            pure, clean water — and it installs in minutes and lasts six months.
    </examples>
  </variant>

  <variant case="technical">
    <system>
      Write a precise, specification-driven product description for a technical
      datasheet. List key capabilities clearly. Avoid marketing language.
    </system>
    <examples>
      - input:
          productName: AquaFilter Pro
          features:
            ["removes 99.9% of contaminants", "lasts 6 months", "easy installation"]
        output:
          description: >
            AquaFilter Pro is a point-of-use water filtration unit rated to
            remove 99.9% of contaminants including heavy metals and chlorine.
            Filter lifespan: 6 months / ~1,500 L. Tool-free cartridge
            replacement; compatible with standard ½" fittings.
    </examples>
  </variant>

  <variant case="brief">
    <system>
      Write a single punchy sentence — product name, top benefit, one
      differentiator. 15 words maximum.
    </system>
    <examples>
      - input:
          productName: AquaFilter Pro
          features:
            ["removes 99.9% of contaminants", "lasts 6 months", "easy installation"]
        output:
          description: >-
            AquaFilter Pro delivers pure water with zero-tool installation
            and a 6-month filter life.
    </examples>
  </variant>
</template>`,
  },
  {
    label: "Conditional logic",
    path: "SummarizeDocument.tp",
    initialCode: `<template name="SummarizeDocument">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      title: string;
      content: string;
      /** If provided, the summary should focus on this topic. */
      focusTopic?: string;
      audience: "executive" | "technical" | "general";
    }

    interface Output {
      summary: string;
      keyPoints: string[];
    }
  </schema>

  <system>
    You are an expert document summarizer.
    <insert snippet="audienceInstruction" />
    <insert snippet="focusInstruction" />
  </system>

  <user>
    Summarize the following document.

    <enclosed tag="Title"><insert val="input.title" /></enclosed>
    <enclosed tag="Document"><insert val="input.content" /></enclosed>
  </user>

  <examples>
    - input:
        title: Quarterly Platform Migration
        content: >-
          We completed migrating our primary database cluster to PostgreSQL 16.
          Query latency dropped 30% and throughput increased by 40%.
        audience: executive
      output:
        summary: >-
          Primary database cluster successfully migrated to PostgreSQL 16,
          resulting in a 30% latency drop and 40% throughput increase.
        keyPoints:
          - Completed migration to PostgreSQL 16
          - Query latency decreased by 30%
          - System throughput increased by 40%

    - input:
        title: API Gateway Redesign
        content: >-
          The API gateway was updated with gRPC-Web proxying and Redis
          rate-limiting middleware. P99 latency is down 12ms.
        focusTopic: Rate Limiting
        audience: technical
      output:
        summary: >-
          API gateway migration introduced Redis-backed token bucket rate
          limiting and gRPC-Web proxying, cutting P99 latency by 12ms.
        keyPoints:
          - Added Redis rate-limiting middleware
          - Implemented gRPC-Web proxying
          - Reduced P99 latency by 12ms
  </examples>

  <!--
    Reusable snippet: inserted at the top of the system prompt.
    Uses <insert val="it"/> to reference the focusTopic expression tested by \`if\`.
  -->
  <snippet name="focusInstruction" if="input.focusTopic" is="notNull">
    <then>
      Focus the summary specifically on the topic: <insert val="it" />.
    </then>
    <else />
  </snippet>

  <!--
    Switch snippet: tailors the tone to the target audience.
  -->
  <snippet name="audienceInstruction" switch="input.audience">
    <on case="executive">
      Write for a non-technical executive audience. Be concise and highlight
      business impact. Avoid jargon.
    </on>
    <on case="technical">
      Write for a technical audience. You may use domain-specific terminology
      and include implementation details where relevant.
    </on>
    <on case="general">
      Write for a general audience with no assumed background knowledge.
      Explain any specialized terms you use.
    </on>
  </snippet>
</template>`,
  },
] as const;

interface DisplayDiagnostic {
  line: number;
  column: number;
  from: number;
  message: string;
}

const activeIndex = ref(0);
const editorContainer = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const diagnostics = ref<DisplayDiagnostic[]>([]);
const isModified = ref(false);
const isMobile = ref(false);

const tabStates = new Map<number, EditorState>();
let createTabStateFn: ((index: number, doc?: string) => EditorState) | null =
  null;
let mediaQuery: MediaQueryList | null = null;
let onMediaChange: ((e: MediaQueryListEvent) => void) | null = null;

function syncStatusFromState(state: EditorState, index: number): void {
  const tab = TABS[index];
  isModified.value = state.doc.toString() !== tab.initialCode;
}

function selectTab(index: number): void {
  activeIndex.value = index;
  const view = editorView.value;
  if (!view || !createTabStateFn) return;
  let state = tabStates.get(index);
  if (!state) {
    state = createTabStateFn(index);
    tabStates.set(index, state);
  }
  view.setState(state);
  updateDiagnostics(state, index);
  syncStatusFromState(state, index);
}

function resetCurrentTab(): void {
  const index = activeIndex.value;
  const view = editorView.value;
  if (!view || !createTabStateFn) return;
  const freshState = createTabStateFn(index, TABS[index].initialCode);
  tabStates.set(index, freshState);
  view.setState(freshState);
  updateDiagnostics(freshState, index);
  syncStatusFromState(freshState, index);
}

function jumpToError(diag: DisplayDiagnostic): void {
  const view = editorView.value;
  if (!view) return;
  view.focus();
  view.dispatch({
    selection: { anchor: diag.from },
    scrollIntoView: true,
  });
}

function focusEditor(): void {
  const view = editorView.value;
  if (!view) return;
  const doc = view.state.doc.toString();
  const schemaIdx = doc.indexOf("<schema>");
  let anchor = 0;
  if (schemaIdx !== -1) {
    const colonIdx = doc.indexOf(":", schemaIdx);
    if (colonIdx !== -1) {
      anchor = colonIdx;
    }
  }
  view.focus();
  view.dispatch({
    selection: { anchor },
    scrollIntoView: true,
  });
}

let getCompilationResultFn:
  | ((state: EditorState) => ReturnType<
      typeof import("@typeprompt/codemirror").getCompilationResult
    >)
  | null = null;

function updateDiagnostics(state: EditorState, index: number): void {
  if (!getCompilationResultFn) return;
  const result = getCompilationResultFn(state);
  const path = TABS[index].path;
  const errors: readonly InternalError[] = result?.finalErrors[path] ?? [];
  const docLength = state.doc.length;
  diagnostics.value = errors.map((err) => {
    const from = Math.max(0, Math.min(docLength, err.span.start));
    const lineObj = state.doc.lineAt(from);
    return {
      line: lineObj.number,
      column: from - lineObj.from + 1,
      from,
      message: err.message,
    };
  });
}

onMounted(async () => {
  if (!editorContainer.value) return;

  const [
    { defaultKeymap, history, historyKeymap, indentWithTab },
    { HighlightStyle, syntaxHighlighting },
    { Compartment, EditorState: CMEditorState },
    { EditorView: CMEditorView, keymap },
    { tags: t },
    { getCompilationResult, typeprompt },
  ] = await Promise.all([
    import("@codemirror/commands"),
    import("@codemirror/language"),
    import("@codemirror/state"),
    import("@codemirror/view"),
    import("@lezer/highlight"),
    import("@typeprompt/codemirror"),
  ]);

  getCompilationResultFn = getCompilationResult;

  const editableCompartment = new Compartment();
  mediaQuery = window.matchMedia("(max-width: 640px)");
  isMobile.value = mediaQuery.matches;
  onMediaChange = (e: MediaQueryListEvent) => {
    isMobile.value = e.matches;
    editorView.value?.dispatch({
      effects: editableCompartment.reconfigure(
        CMEditorView.editable.of(!e.matches),
      ),
    });
  };
  mediaQuery.addEventListener("change", onMediaChange);

  // Match VitePress's exact Shiki token CSS variables so light & dark mode
  // look identical to static code blocks and switch instantaneously.
  const vitepressHighlightStyle = HighlightStyle.define([
    { tag: t.tagName, color: "var(--shiki-token-tag)" },
    { tag: t.attributeName, color: "var(--shiki-token-attribute)" },
    { tag: t.keyword, color: "var(--shiki-token-keyword)" },
    { tag: t.annotation, color: "var(--shiki-token-function)" },
    { tag: t.string, color: "var(--shiki-token-string)" },
    { tag: [t.number, t.bool], color: "var(--shiki-token-constant)" },
    {
      tag: t.comment,
      color: "var(--shiki-token-comment)",
      fontStyle: "italic",
    },
  ]);

  createTabStateFn = (index: number, doc?: string): EditorState => {
    const tab = TABS[index];
    return CMEditorState.create({
      doc: doc ?? tab.initialCode,
      extensions: [
        editableCompartment.of(CMEditorView.editable.of(!isMobile.value)),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        syntaxHighlighting(vitepressHighlightStyle),
        typeprompt({
          path: tab.path,
          workspaceFiles: WORKSPACE_FILES,
          patchBase: null,
        }),
        CMEditorView.updateListener.of((update) => {
          tabStates.set(activeIndex.value, update.state);
          if (update.docChanged) {
            updateDiagnostics(update.state, activeIndex.value);
            syncStatusFromState(update.state, activeIndex.value);
          }
        }),
      ],
    });
  };

  const initialState = createTabStateFn(0);
  tabStates.set(0, initialState);

  const view = new CMEditorView({
    state: initialState,
    parent: editorContainer.value,
  });

  editorView.value = view;
  updateDiagnostics(initialState, 0);
  syncStatusFromState(initialState, 0);
});

onBeforeUnmount(() => {
  if (mediaQuery && onMediaChange) {
    mediaQuery.removeEventListener("change", onMediaChange);
  }
  editorView.value?.destroy();
});
</script>

<template>
  <div class="vp-code-group tp-live-code-group">
    <div class="tabs">
      <template v-for="(tab, idx) in TABS" :key="tab.path">
        <input
          :id="`tp-live-tab-${idx}`"
          type="radio"
          name="tp-live-tabs"
          :checked="activeIndex === idx"
          @change="selectTab(idx)"
        />
        <label :for="`tp-live-tab-${idx}`" @click="selectTab(idx)">
          {{ tab.label }}
        </label>
      </template>

      <div v-if="!isMobile" class="tp-live-status">
        <button
          v-if="isModified"
          type="button"
          class="tp-reset-btn"
          title="Restore original example"
          @click="resetCurrentTab"
        >
          Undo changes
        </button>
        <span
          v-if="diagnostics.length > 0"
          class="tp-badge tp-badge-error"
          @click="jumpToError(diagnostics[0])"
        >
          ✕ {{ diagnostics.length }}
          {{ diagnostics.length === 1 ? "error" : "errors" }}
        </span>
      </div>
    </div>

    <div class="blocks">
      <div class="language-xml active tp-cm-wrapper">
        <pre v-if="!editorView" class="tp-ssr-fallback"><code>{{ TABS[activeIndex].initialCode }}</code></pre>
        <div ref="editorContainer" class="tp-cm-mount"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tp-live-code-group .tabs {
  align-items: center;
}

.tp-live-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  padding-right: 4px;
  flex-shrink: 0;
}

.tp-badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  padding: 5px 10px;
  border-radius: 999px;
  white-space: nowrap;
  user-select: none;
}

.tp-badge-ok {
  color: var(--vp-c-text-2);
  background: var(--vp-c-default-soft);
  border: 1px solid var(--vp-c-divider);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tp-badge-ok:hover {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-1);
}

.tp-badge-error {
  color: #f85149;
  background: rgba(248, 81, 73, 0.12);
  border: 1px solid rgba(248, 81, 73, 0.35);
  cursor: pointer;
}

.tp-reset-btn {
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  padding: 5px 10px;
  border-radius: 999px;
  color: var(--vp-c-text-2);
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tp-reset-btn:hover {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-1);
}

.tp-cm-wrapper {
  position: relative;
  background-color: var(--vp-code-block-bg) !important;
  overflow: hidden;
}

@media (min-width: 640px) {
  .tp-cm-wrapper {
    border-radius: 0 0 10px 10px !important;
  }
}

.tp-ssr-fallback {
  margin: 0 !important;
  padding: 20px 24px !important;
  max-height: 520px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: var(--vp-code-font-size, 14px);
  line-height: var(--vp-code-line-height, 1.7);
  color: var(--shiki-token-punctuation);
}

.tp-cm-mount :deep(.cm-editor) {
  background-color: var(--vp-code-block-bg);
  color: var(--shiki-token-punctuation);
  font-family: var(--vp-font-family-mono);
  font-size: var(--vp-code-font-size, 14px);
  line-height: var(--vp-code-line-height, 1.7);
}

.tp-cm-mount :deep(.cm-editor.cm-focused) {
  outline: none;
}

.tp-cm-mount :deep(.cm-gutters) {
  background-color: transparent !important;
  border-right: none !important;
  padding-left: 2px;
}

.tp-cm-mount :deep(.cm-gutter-lint) {
  width: 16px;
}

.tp-cm-mount :deep(.cm-scroller) {
  font-family: var(--vp-font-family-mono);
  line-height: var(--vp-code-line-height, 1.7);
  max-height: 520px;
  overflow: auto;
  padding: 20px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--vp-c-divider) transparent;
}

.tp-cm-mount :deep(.cm-content) {
  padding: 0;
  caret-color: var(--vp-c-brand-1);
}

.tp-cm-mount :deep(.cm-line) {
  padding: 0 24px 0 6px;
  border-radius: 3px;
  transition: background-color 0.1s ease;
}

@media (min-width: 640px) {
  .tp-cm-mount :deep(.cm-line:hover) {
    background-color: rgba(109, 94, 252, 0.07);
  }
}

.tp-cm-mount :deep(.cm-selectionBackground) {
  background-color: var(--vp-c-brand-soft) !important;
}

.tp-cm-mount :deep(.cm-cursor) {
  border-left-color: var(--vp-c-brand-1);
}

.tp-cm-mount :deep(.cm-tooltip) {
  border: 1px solid var(--vp-c-divider);
  background-color: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  border-radius: 6px;
  font-family: var(--vp-font-family-base);
  font-size: 13px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}
</style>
