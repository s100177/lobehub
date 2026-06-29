'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import type { CSSProperties } from 'react';
import { memo, useCallback, useEffect, useState } from 'react';

import type {
  BrowserClarificationPrompt,
  BrowserPageState,
  BrowserState,
  BrowserSuggestedTask,
  BrowserTaskState,
} from '../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    background: ${cssVar.colorBgContainer};
  `,
  toolbar: css`
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgElevated};
  `,
  urlBar: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 999px;

    font-size: 13px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  iframe: css`
    flex: 1;

    width: 100%;
    border: none;
    border-radius: 0;

    background: #fff;
  `,
  modeBadge: css`
    padding-block: 4px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 999px;

    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  actionButton: css`
    cursor: pointer;

    padding-block: 6px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorPrimary};

    background: transparent;

    &:disabled {
      cursor: not-allowed;
      color: ${cssVar.colorTextDisabled};
    }
  `,
  primaryButton: css`
    cursor: pointer;

    padding-block: 7px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorPrimary};
    border-radius: 8px;

    font-size: 12px;
    font-weight: 700;
    color: #fff;

    background: ${cssVar.colorPrimary};

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  `,
  secondaryButton: css`
    cursor: pointer;

    padding-block: 7px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgContainer};
  `,
  summaryGrid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;

    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  signalGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  signalCard: css`
    overflow: hidden;

    padding: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
  signalLabel: css`
    margin-block-end: 4px;

    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
  `,
  signalValue: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  taskCard: css`
    margin-block: 10px 0;
    margin-inline: 12px;
    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    background: ${cssVar.colorBgContainer};
  `,
  runtimeCard: css`
    margin-block: 10px 0;
    margin-inline: 12px;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: linear-gradient(135deg, ${cssVar.colorBgContainer}, ${cssVar.colorFillQuaternary});
    box-shadow: 0 8px 24px rgb(15 23 42 / 8%);
  `,
  runtimeHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 8px;

    font-size: 12px;
    font-weight: 800;
    color: ${cssVar.colorText};
  `,
  runtimeActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 10px;
  `,
  clarificationInput: css`
    box-sizing: border-box;
    width: 100%;
    margin-block-start: 8px;
    padding-block: 7px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgContainer};
  `,
  clarificationAnswerList: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-block-start: 8px;
  `,
  optionRow: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-block-start: 8px;
  `,
  optionButton: css`
    cursor: pointer;

    overflow: hidden;

    padding-block: 7px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorText};
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;

    background: ${cssVar.colorBgContainer};

    &[aria-pressed='true'] {
      border-color: ${cssVar.colorPrimary};
      color: ${cssVar.colorPrimary};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  taskTitle: css`
    margin-block-end: 6px;
    font-size: 12px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  taskText: css`
    margin-block-end: 6px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  taskPills: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  `,
  planSteps: css`
    display: grid;
    gap: 6px;
    margin-block-start: 8px;
  `,
  planStep: css`
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: start;

    padding-block: 6px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgContainer};
  `,
  suggestedTaskGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
    margin-block-start: 8px;
  `,
  suggestedTaskCard: css`
    cursor: pointer;

    display: grid;
    gap: 5px;

    padding: 9px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    color: inherit;
    text-align: start;

    appearance: none;
    background: ${cssVar.colorBgContainer};

    &[aria-pressed='true'] {
      border-color: ${cssVar.colorPrimary};
      box-shadow: 0 0 0 2px ${cssVar.colorFillSecondary};
    }
  `,
  planStatus: css`
    padding-block: 2px;
    padding-inline: 6px;
    border-radius: 999px;

    font-size: 10px;
    font-weight: 800;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  pill: css`
    padding-block: 3px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 11px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  list: css`
    margin: 0;
    padding-inline-start: 16px;
    font-size: 12px;
    color: ${cssVar.colorText};
  `,
  summaryCard: css`
    overflow: hidden;

    padding: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
  summaryLabel: css`
    margin-block-end: 4px;

    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
  `,
  summaryValue: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  timeline: css`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;

    max-height: 132px;
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  timelineHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 2px;

    font-size: 12px;
    font-weight: 800;
    color: ${cssVar.colorText};
  `,
  eventItem: css`
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: start;

    font-size: 12px;
    color: ${cssVar.colorText};
  `,
  eventStatus: css`
    padding-block: 2px;
    padding-inline: 6px;
    border-radius: 999px;

    font-size: 10px;
    font-weight: 700;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  riskNotice: css`
    margin-block: 10px 0;
    margin-inline: 12px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid #f59e0b;
    border-radius: 10px;

    font-size: 12px;
    color: #92400e;

    background: #fffbeb;
  `,
  viewportFrame: css`
    position: relative;

    overflow: hidden;
    display: flex;
    flex: 1;

    min-height: 0;
  `,
  takeoverFrame: css`
    &::before {
      pointer-events: none;
      content: '';

      position: absolute;
      z-index: 3;
      inset: 6px;

      border: 3px solid #16a34a;
      border-radius: 14px;

      animation: browser-agent-pulse 1.8s ease-in-out infinite;
    }

    @keyframes browser-agent-pulse {
      0% {
        border-color: #16a34a;
        box-shadow: 0 0 0 0 rgb(22 163 74 / 28%);
      }

      50% {
        border-color: #06b6d4;
        box-shadow: 0 0 0 7px rgb(6 182 212 / 16%);
      }

      100% {
        border-color: #16a34a;
        box-shadow: 0 0 0 0 rgb(22 163 74 / 28%);
      }
    }
  `,
  targetHighlight: css`
    pointer-events: none;

    position: absolute;
    z-index: 4;
    inset-block-start: 22px;
    inset-inline-start: 22px;

    max-width: min(320px, calc(100% - 44px));
    padding-block: 8px;
    padding-inline: 12px;
    border: 2px solid #f59e0b;
    border-radius: 10px;

    font-size: 12px;
    font-weight: 700;
    color: #92400e;

    background: rgb(255 251 235 / 92%);
    box-shadow: 0 10px 32px rgb(146 64 14 / 18%);
  `,
  targetBox: css`
    pointer-events: none;

    position: absolute;
    z-index: 4;

    min-width: 16px;
    min-height: 16px;
    border: 3px solid #f59e0b;
    border-radius: 10px;

    background: rgb(245 158 11 / 10%);
    box-shadow:
      0 0 0 9999px rgb(15 23 42 / 3%),
      0 0 0 8px rgb(245 158 11 / 12%),
      0 12px 32px rgb(146 64 14 / 22%);

    animation: browser-target-scan 1.4s ease-in-out infinite;

    @keyframes browser-target-scan {
      0%,
      100% {
        transform: scale(1);
        border-color: #f59e0b;
      }

      50% {
        transform: scale(1.01);
        border-color: #22d3ee;
      }
    }
  `,
  targetBoxLabel: css`
    position: absolute;
    inset-block-start: -32px;
    inset-inline-start: 0;

    overflow: hidden;

    max-width: min(360px, 80vw);
    padding-block: 5px;
    padding-inline: 9px;
    border-radius: 999px;

    font-size: 12px;
    font-weight: 800;
    color: #fff7ed;
    text-overflow: ellipsis;
    white-space: nowrap;

    background: rgb(15 23 42 / 88%);
  `,
  empty: css`
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;

    font-size: 14px;
    color: ${cssVar.colorTextDescription};
  `,
  result: css`
    overflow: auto;

    max-height: 120px;
    margin: 8px;
    padding: 12px;
    border-radius: 8px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorText};
    white-space: pre-wrap;

    background: ${cssVar.colorFillQuaternary};
  `,
  notice: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface BrowserPanelProps {
  sessionId: string;
  showResult?: boolean;
  state: BrowserState;
}

const taskStateDescriptions: Partial<Record<BrowserTaskState, string>> = {
  acting: 'AI is executing the authorized workflow.',
  ai_controlling: 'AI is controlling this browser after your authorization.',
  asking_clarification: 'AI needs your help to disambiguate the page or intent.',
  completed: 'The browser workflow is completed.',
  failed: 'The browser workflow failed and needs review.',
  idle: 'No active workflow has started yet.',
  needs_more_info: 'The page still needs login or other missing information.',
  paused_by_user_intervention: 'Automation is paused because you interacted with the page.',
  plan_ready: 'The page is understood and ready for execution planning.',
  risk_blocked: 'A risky action was blocked before execution.',
  understanding: 'AI is reading the page and preparing a plan.',
  verifying: 'AI is verifying the latest browser state.',
  waiting_user_authorization: 'AI has a plan and is waiting for your confirmation.',
};

const controllingStates = new Set<BrowserTaskState>(['ai_controlling', 'acting', 'verifying']);

const authorizationStates = new Set<BrowserTaskState>(['plan_ready', 'waiting_user_authorization']);

const clarificationStates = new Set<BrowserTaskState>(['asking_clarification', 'needs_more_info']);

const interactionModeLabels: Record<
  'answer' | 'review' | 'surface' | 'takeover',
  { description: string; title: string }
> = {
  answer: {
    description: 'AI is only reading or answering from the current page.',
    title: '问答模式',
  },
  review: {
    description: 'AI has a plan or question, but waits for your decision before acting.',
    title: '审阅模式',
  },
  surface: {
    description: 'AI is authorized to operate the current page within safe boundaries.',
    title: '界面模式',
  },
  takeover: {
    description: 'You interacted with the browser, so automation is paused until you resume.',
    title: '接管模式',
  },
};

const getInteractionMode = (taskState?: BrowserTaskState) => {
  if (taskState === 'paused_by_user_intervention') return interactionModeLabels.takeover;
  if (taskState && controllingStates.has(taskState)) return interactionModeLabels.surface;
  if (
    taskState &&
    (authorizationStates.has(taskState) ||
      clarificationStates.has(taskState) ||
      taskState === 'risk_blocked')
  )
    return interactionModeLabels.review;

  return interactionModeLabels.answer;
};

const hasTargetBox = (
  target: BrowserPageState['targetHighlight'],
): target is NonNullable<BrowserPageState['targetHighlight']> &
  Required<
    Pick<NonNullable<BrowserPageState['targetHighlight']>, 'height' | 'width' | 'x' | 'y'>
  > =>
  Number.isFinite(target?.x) &&
  Number.isFinite(target?.y) &&
  Number.isFinite(target?.width) &&
  Number.isFinite(target?.height) &&
  (target?.width ?? 0) > 0 &&
  (target?.height ?? 0) > 0;

const deriveClarification = (
  pageState?: BrowserPageState,
): BrowserClarificationPrompt | undefined => {
  const gap = pageState?.gaps?.[0];
  if (!gap) return undefined;

  if (gap === 'login_required') {
    return {
      id: 'login_required',
      question: '当前页面需要登录。请先在浏览器中完成登录，然后点击继续。',
      required: true,
    };
  }

  if (gap === 'missing_field_values') {
    return {
      field: 'missing_field_values',
      id: 'missing_field_values',
      question: '页面存在未填写字段。请补充字段值，或说明希望 AI 如何填写。',
      required: true,
    };
  }

  return {
    id: gap,
    question: `页面需要你确认：${gap}`,
    required: false,
  };
};

const getClarificationInputKey = (prompt?: BrowserClarificationPrompt) =>
  prompt?.field || prompt?.id || 'query';

const BrowserPanel = memo<BrowserPanelProps>(({ state, showResult, sessionId }) => {
  const [localState, setLocalState] = useState<BrowserState | undefined>(state);
  const [isSwitching, setIsSwitching] = useState(false);
  const [iframeStatus, setIframeStatus] = useState<'blocked' | 'loaded' | 'loading'>('loading');
  const [switchError, setSwitchError] = useState<string>();
  const [clarificationText, setClarificationText] = useState('');
  const [clarificationInputs, setClarificationInputs] = useState<Record<string, string>>({});
  const [activeClarificationIndex, setActiveClarificationIndex] = useState(0);
  const [selectedClarification, setSelectedClarification] = useState<string>();
  const [selectedSuggestedTask, setSelectedSuggestedTask] = useState<BrowserSuggestedTask>();
  const [riskDecision, setRiskDecision] = useState<'allowed_manual' | 'cancelled' | 'manual'>();

  useEffect(() => {
    setLocalState(state);
    setIframeStatus('loading');
    setSwitchError(undefined);
    setActiveClarificationIndex(0);
    setClarificationText('');
    setSelectedClarification(undefined);
    setSelectedSuggestedTask(undefined);
    setRiskDecision(undefined);
  }, [state]);

  const currentState = localState;

  useEffect(() => {
    if (currentState?.mode !== 'iframe') return;

    const timer = window.setTimeout(() => {
      setIframeStatus((status) => (status === 'loading' ? 'blocked' : status));
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [currentState?.mode, currentState?.url]);

  const taskState = currentState?.taskState;
  const interactionMode = getInteractionMode(taskState);

  const updateTaskState = (nextTaskState: BrowserTaskState) => {
    setLocalState((previous) => (previous ? { ...previous, taskState: nextTaskState } : previous));
  };

  const appendLocalEvent = useCallback(
    (summary: string, status: 'blocked' | 'error' | 'start' | 'success') => {
      setLocalState((previous) => {
        if (!previous) return previous;

        return {
          ...previous,
          actionEvents: [
            ...(previous.actionEvents ?? []),
            {
              action: 'inspect',
              id: `local-${Date.now()}`,
              status,
              summary,
              timestamp: Date.now(),
            },
          ].slice(-20),
        };
      });
    },
    [],
  );

  const interruptAutomation = useCallback(
    async (inputType: string) => {
      appendLocalEvent(`Paused because user ${inputType} in the browser.`, 'blocked');
      updateTaskState('paused_by_user_intervention');

      try {
        const res = await fetch('/api/browser/action', {
          body: JSON.stringify({
            action: 'interrupt',
            params: {
              inputType,
              reason: `Automation paused because the user performed ${inputType} in the browser.`,
            },
            sessionId,
          }),
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const data = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(data?.error || `Interrupt failed with HTTP ${res.status}`);
        setLocalState({ ...data, sessionId });
      } catch (err) {
        appendLocalEvent(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    [appendLocalEvent, sessionId],
  );

  useEffect(() => {
    if (!taskState || !controllingStates.has(taskState)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source !== 'lobe-browser-viewer') return;
      if (event.data?.type !== 'user-input') return;
      if (event.data?.sessionId !== sessionId) return;

      void interruptAutomation(event.data.inputType || 'input');
    };

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [interruptAutomation, sessionId, taskState]);

  if (!currentState) {
    return (
      <div className={styles.empty}>No browser data yet. Ask the AI to navigate somewhere.</div>
    );
  }

  const { fallbackReason, iframeUrl, mode = 'remote', result, title, url } = currentState;
  const displayUrl = iframeUrl || url;
  const isIframeMode = mode === 'iframe';
  const modeLabel = isIframeMode ? 'Iframe' : 'Remote';
  const recentEvents = currentState.actionEvents?.slice(-20).reverse() ?? [];
  const executionEvents = currentState.executionEvents?.slice(-20).reverse() ?? [];
  const executionTimeline = currentState.executionTimeline?.slice(-30).reverse() ?? [];
  const pageState = currentState.pageState;
  const riskyActions = pageState?.actions?.filter((action) => action.risk).slice(0, 3) ?? [];
  const selectedOptions = pageState?.selectedOptions?.filter(Boolean).slice(0, 3) ?? [];
  const prices = pageState?.prices?.slice(0, 2) ?? [];
  const pageType = pageState?.pageType;
  const loggedIn = pageState?.loggedIn;
  const confirmBeforeProceed = pageState?.confirmBeforeProceed;
  const needsUserAttention = pageState?.needsUserAttention;
  const workflowHints = pageState?.workflowHints?.slice(0, 3) ?? [];
  const suggestedTasks = pageState?.suggestedTasks?.slice(0, 4) ?? [];
  const gaps = pageState?.gaps?.slice(0, 3) ?? [];
  const confirmationPoints = pageState?.confirmationPoints?.slice(0, 2) ?? [];
  const plan = currentState.plan;
  const executionState = currentState.executionState;
  const planSteps =
    plan?.steps?.slice(0, 6).map((step) => ({
      ...step,
      status:
        executionState?.blockedStepId === step.id
          ? 'blocked'
          : executionState?.completedStepIds.includes(step.id)
            ? 'completed'
            : executionState?.currentStepId === step.id
              ? 'current'
              : step.status,
    })) ?? [];
  const isControlling = taskState ? controllingStates.has(taskState) : false;
  const fallbackClarification = deriveClarification(pageState);
  const clarificationPrompts =
    pageState?.clarifications && pageState.clarifications.length > 0
      ? pageState.clarifications
      : fallbackClarification
        ? [fallbackClarification]
        : [];
  const activeClarification =
    clarificationPrompts[activeClarificationIndex] ?? clarificationPrompts[0];
  const answeredClarifications = clarificationPrompts.filter(
    (prompt) => clarificationInputs[getClarificationInputKey(prompt)],
  );
  const allRequiredClarificationsAnswered = clarificationPrompts
    .filter((prompt) => prompt.required !== false)
    .every((prompt) => Boolean(clarificationInputs[getClarificationInputKey(prompt)]));
  const targetHighlight = pageState?.targetHighlight;
  const targetBoxVisible =
    isIframeMode &&
    isControlling &&
    Boolean(currentState.viewport) &&
    hasTargetBox(targetHighlight);
  const targetBoxStyle: CSSProperties | undefined =
    targetBoxVisible && currentState.viewport
      ? {
          height: `${Math.max(0.5, (targetHighlight.height / currentState.viewport.height) * 100)}%`,
          left: `${Math.max(0, (targetHighlight.x / currentState.viewport.width) * 100)}%`,
          pointerEvents: 'none',
          top: `${Math.max(0, (targetHighlight.y / currentState.viewport.height) * 100)}%`,
          width: `${Math.max(0.5, (targetHighlight.width / currentState.viewport.width) * 100)}%`,
        }
      : undefined;
  const targetLabel =
    targetHighlight?.label ||
    targetHighlight?.selector ||
    pageState?.primaryActions?.[0]?.text ||
    recentEvents.find((event) => event.target)?.target;

  const buildPlanInputs = () => {
    const inputs: Record<string, string> = { ...clarificationInputs };
    const answer = selectedClarification || clarificationText;
    if (answer) {
      const key = getClarificationInputKey(activeClarification);
      inputs[key] = answer;
      if (key !== 'query' && !inputs.query && pageType === 'search') inputs.query = answer;
    }

    return inputs;
  };

  const buildExecutePlanParams = () => ({
    authorized: true,
    inputs: buildPlanInputs(),
    ...(selectedSuggestedTask?.intent ? { intent: selectedSuggestedTask.intent } : {}),
    maxSteps: 4,
  });

  const mergeActiveClarificationInput = (prompt?: BrowserClarificationPrompt) => {
    const answer = selectedClarification || clarificationText || prompt?.defaultValue;
    const inputs: Record<string, string> = { ...clarificationInputs };

    if (answer && prompt) {
      const key = getClarificationInputKey(prompt);
      inputs[key] = answer;
    }

    return { answer, inputs };
  };

  const continueExecutionAfterInspect = async () => {
    try {
      const inspectRes = await fetch('/api/browser/action', {
        body: JSON.stringify({
          action: 'inspect',
          params: {},
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const inspected = await inspectRes.json().catch(() => undefined);
      if (!inspectRes.ok)
        throw new Error(inspected?.error || `Inspect failed with HTTP ${inspectRes.status}`);

      setLocalState({ ...inspected, sessionId, taskState: 'ai_controlling' });

      const executeRes = await fetch('/api/browser/action', {
        body: JSON.stringify({
          action: 'executePlan',
          params: { ...buildExecutePlanParams(), inspectedAfterIntervention: true },
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const executed = await executeRes.json().catch(() => undefined);
      if (!executeRes.ok)
        throw new Error(executed?.error || `Execute plan failed with HTTP ${executeRes.status}`);

      setLocalState({ ...executed, sessionId });
    } catch (err) {
      appendLocalEvent(err instanceof Error ? err.message : String(err), 'error');
      updateTaskState('failed');
    }
  };

  const executeAuthorizedPlan = async () => {
    appendLocalEvent('User authorized AI browser control.', 'success');
    updateTaskState('ai_controlling');

    try {
      const res = await fetch('/api/browser/action', {
        body: JSON.stringify({
          action: 'executePlan',
          params: buildExecutePlanParams(),
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(data?.error || `Execute plan failed with HTTP ${res.status}`);

      setLocalState({ ...data, sessionId });
      setClarificationText('');
      setSelectedClarification(undefined);
    } catch (err) {
      appendLocalEvent(err instanceof Error ? err.message : String(err), 'error');
      updateTaskState('failed');
    }
  };

  const pauseByIntervention = () => {
    if (!isControlling) return;

    void interruptAutomation('viewport');
  };

  const continueAfterPause = () => continueExecutionAfterInspect();

  const selectSuggestedTask = (task: BrowserSuggestedTask) => {
    setSelectedSuggestedTask(task);
    appendLocalEvent(`Selected suggested task: ${task.title}`, 'success');
    updateTaskState('waiting_user_authorization');
  };

  const markRiskDecision = (decision: 'allowed_manual' | 'cancelled' | 'manual') => {
    setRiskDecision(decision);

    if (decision === 'allowed_manual') {
      appendLocalEvent(
        'User allowed this risky action for manual handling. AI did not execute it automatically.',
        'blocked',
      );
      updateTaskState('paused_by_user_intervention');
      return;
    }

    if (decision === 'manual') {
      appendLocalEvent('User chose to handle the risky action manually.', 'blocked');
      updateTaskState('idle');
      return;
    }

    appendLocalEvent('User cancelled the risky browser task.', 'blocked');
    updateTaskState('idle');
  };

  const saveClarification = (prompt?: BrowserClarificationPrompt) => {
    const { answer, inputs } = mergeActiveClarificationInput(prompt);
    if (answer) setClarificationInputs(inputs);
    appendLocalEvent(
      answer ? `User answered clarification: ${answer}` : 'User skipped clarification.',
      'success',
    );
    setClarificationText('');
    setSelectedClarification(undefined);

    const nextIndex = clarificationPrompts.findIndex(
      (candidate, index) =>
        index > activeClarificationIndex && !inputs[getClarificationInputKey(candidate)],
    );
    if (nextIndex >= 0) setActiveClarificationIndex(nextIndex);
  };

  const submitClarifications = (prompt?: BrowserClarificationPrompt) => {
    const { answer, inputs } = mergeActiveClarificationInput(prompt);
    if (answer) {
      setClarificationInputs(inputs);
      appendLocalEvent(`User answered clarification: ${answer}`, 'success');
    }
    setClarificationText('');
    setSelectedClarification(undefined);
    updateTaskState('waiting_user_authorization');
  };

  const switchToRemote = async () => {
    if (!url || isSwitching) return;

    setIsSwitching(true);
    setSwitchError(undefined);
    try {
      const res = await fetch('/api/browser/action', {
        body: JSON.stringify({
          action: 'navigate',
          params: { mode: 'remote', url },
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(data?.error || `Remote switch failed with HTTP ${res.status}`);

      setLocalState({ ...data, sessionId });
      setIframeStatus('loading');
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <Flexbox className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.modeBadge}>{modeLabel}</div>
        <div className={styles.urlBar}>
          <span style={{ opacity: 0.5 }}>{title || 'Browser'}</span>
          {displayUrl && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayUrl}
            </span>
          )}
        </div>
        <button
          className={styles.actionButton}
          disabled={!url || isSwitching || !isIframeMode}
          type="button"
          onClick={switchToRemote}
        >
          {isSwitching ? 'Switching...' : 'Use Remote'}
        </button>
      </div>
      {fallbackReason && <div className={styles.notice}>{fallbackReason}</div>}
      {switchError && <div className={styles.notice}>{switchError}</div>}
      {taskState && (
        <div className={styles.taskCard}>
          <div className={styles.taskTitle}>Task State: {taskState}</div>
          <div className={styles.taskText}>{taskStateDescriptions[taskState]}</div>
          <div className={styles.taskPills}>
            <span className={styles.pill}>Mode: {interactionMode.title}</span>
            {pageType && <span className={styles.pill}>{pageType}</span>}
            {loggedIn !== undefined && (
              <span className={styles.pill}>{loggedIn ? 'logged in' : 'needs login'}</span>
            )}
            {confirmBeforeProceed !== undefined && (
              <span className={styles.pill}>
                {confirmBeforeProceed ? 'confirm before proceed' : 'no confirm gate'}
              </span>
            )}
            {needsUserAttention && <span className={styles.pill}>needs attention</span>}
            {executionState?.phase && (
              <span className={styles.pill}>phase: {executionState.phase}</span>
            )}
            {executionState && <span className={styles.pill}>cursor: {executionState.cursor}</span>}
            {executionState?.currentStepId && (
              <span className={styles.pill}>step: {executionState.currentStepId}</span>
            )}
          </div>
          <div aria-label="Browser interaction mode" className={styles.taskText}>
            {interactionMode.title}：{interactionMode.description}
          </div>
        </div>
      )}
      {suggestedTasks.length > 0 && (
        <div aria-label="Browser suggested tasks" className={styles.runtimeCard}>
          <div className={styles.runtimeHeader}>
            <span>当前页面推荐任务</span>
            <span className={styles.pill}>from page state</span>
          </div>
          <div className={styles.taskText}>
            这些任务来自当前页面类型、字段、价格、风险按钮和技能包匹配结果；点击执行前仍需要授权。
          </div>
          <div className={styles.suggestedTaskGrid}>
            {suggestedTasks.map((task) => (
              <button
                aria-pressed={selectedSuggestedTask?.intent === task.intent}
                className={styles.suggestedTaskCard}
                key={task.intent}
                type="button"
                onClick={() => selectSuggestedTask(task)}
              >
                <div className={styles.taskTitle}>{task.title}</div>
                <div className={styles.taskText}>{task.reason}</div>
                <div className={styles.taskPills}>
                  <span className={styles.pill}>{task.risk}</span>
                  <span className={styles.pill}>{task.intent}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {taskState && authorizationStates.has(taskState) && (
        <div aria-label="Browser authorization card" className={styles.runtimeCard}>
          <div className={styles.runtimeHeader}>
            <span>执行前授权</span>
            <span className={styles.pill}>waiting confirmation</span>
          </div>
          <div className={styles.taskText}>
            AI
            已读取页面并准备按计划操作。确认后只进入接管态；购买、支付、提交、删除、释放和授权类动作仍会停下。
          </div>
          {workflowHints.length > 0 && (
            <ul className={styles.list}>
              {workflowHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
          {selectedSuggestedTask && (
            <div className={styles.taskCard}>
              <div className={styles.taskTitle}>已选择推荐任务</div>
              <div className={styles.taskText}>{selectedSuggestedTask.title}</div>
              <div className={styles.taskPills}>
                <span className={styles.pill}>{selectedSuggestedTask.risk}</span>
                <span className={styles.pill}>{selectedSuggestedTask.intent}</span>
              </div>
            </div>
          )}
          {plan && (
            <div aria-label="Browser agent plan" className={styles.planSteps}>
              <div className={styles.taskText}>
                计划来源：{plan.source === 'skill_pack' ? '页面技能包 workflow' : '页面启发式'}
                ；目标：
                {plan.goal}
              </div>
              {planSteps.map((step) => (
                <div className={styles.planStep} key={step.id}>
                  <span className={styles.planStatus}>{step.status}</span>
                  <span>
                    {step.title}
                    {step.risk ? ` (${step.risk})` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className={styles.runtimeActions}>
            <button className={styles.primaryButton} type="button" onClick={executeAuthorizedPlan}>
              帮我操作
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => updateTaskState('idle')}
            >
              只给建议
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => updateTaskState('idle')}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {isControlling && (
        <div aria-label="AI takeover status" className={styles.runtimeCard}>
          <div className={styles.runtimeHeader}>
            <span>AI 接管中</span>
            <span className={styles.pill}>takeover active</span>
          </div>
          <div className={styles.taskText}>
            当前浏览器处于授权接管态。你手动点击、输入或滚动后，自动执行会暂停并重新确认。
          </div>
          {targetLabel && <div className={styles.taskText}>当前目标：{targetLabel}</div>}
        </div>
      )}
      {taskState === 'paused_by_user_intervention' && (
        <div aria-label="Browser pause card" className={styles.runtimeCard}>
          <div className={styles.runtimeHeader}>
            <span>检测到人工介入</span>
            <span className={styles.pill}>paused</span>
          </div>
          <div className={styles.taskText}>
            你刚刚操作了页面。继续自动执行前需要重新读取页面，避免 AI 基于旧状态继续操作。
          </div>
          <div className={styles.runtimeActions}>
            <button className={styles.primaryButton} type="button" onClick={continueAfterPause}>
              重新读取并继续
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => updateTaskState('idle')}
            >
              停止自动执行
            </button>
          </div>
        </div>
      )}
      {taskState && clarificationStates.has(taskState) && activeClarification && (
        <div aria-label="Browser clarification card" className={styles.runtimeCard}>
          <div className={styles.runtimeHeader}>
            <span>需要你补充信息</span>
            <span className={styles.pill}>
              {activeClarificationIndex + 1}/{clarificationPrompts.length}
              {' · '}
              {activeClarification.required ? 'required' : 'optional'}
            </span>
          </div>
          <div className={styles.taskText}>{activeClarification.question}</div>
          {answeredClarifications.length > 0 && (
            <div
              aria-label="Browser clarification answers"
              className={styles.clarificationAnswerList}
            >
              {answeredClarifications.map((prompt) => {
                const key = getClarificationInputKey(prompt);

                return (
                  <span className={styles.pill} key={key}>
                    {key}: {clarificationInputs[key]}
                  </span>
                );
              })}
            </div>
          )}
          {activeClarification.options && activeClarification.options.length > 0 && (
            <div className={styles.optionRow}>
              {activeClarification.options.map((option) => (
                <button
                  aria-pressed={selectedClarification === option.value}
                  className={styles.optionButton}
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedClarification(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <input
            className={styles.clarificationInput}
            placeholder={activeClarification.defaultValue || '补充说明或字段值'}
            value={clarificationText}
            onChange={(event) => setClarificationText(event.currentTarget.value)}
          />
          <div className={styles.runtimeActions}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => saveClarification(activeClarification)}
            >
              保存回答
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={
                !allRequiredClarificationsAnswered && !selectedClarification && !clarificationText
              }
              onClick={() => submitClarifications(activeClarification)}
            >
              确认并继续规划
            </button>
            {!activeClarification.required && (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => saveClarification(activeClarification)}
              >
                跳过
              </button>
            )}
          </div>
        </div>
      )}
      {(pageType ||
        loggedIn !== undefined ||
        confirmBeforeProceed !== undefined ||
        needsUserAttention) && (
        <div className={styles.signalGrid}>
          <div className={styles.signalCard}>
            <div className={styles.signalLabel}>Page Type</div>
            <div className={styles.signalValue}>{pageType || 'Unknown'}</div>
          </div>
          <div className={styles.signalCard}>
            <div className={styles.signalLabel}>Login</div>
            <div className={styles.signalValue}>
              {loggedIn === undefined ? 'Unknown' : loggedIn ? 'Logged in' : 'Needs login'}
            </div>
          </div>
          <div className={styles.signalCard}>
            <div className={styles.signalLabel}>Confirm</div>
            <div className={styles.signalValue}>
              {confirmBeforeProceed ? 'Required' : 'Not required'}
            </div>
          </div>
          <div className={styles.signalCard}>
            <div className={styles.signalLabel}>Attention</div>
            <div className={styles.signalValue}>
              {needsUserAttention ? 'Needs user input' : 'No immediate gap'}
            </div>
          </div>
        </div>
      )}
      {currentState.riskBlock && (
        <div aria-label="Browser risk block card" className={styles.riskNotice}>
          <strong>Risky action blocked.</strong> {currentState.riskBlock.reason}. This action is
          classified as {currentState.riskBlock.risk}; AI will not execute it automatically.
          {riskDecision && (
            <div aria-label="Browser risk decision" className={styles.taskText}>
              {riskDecision === 'allowed_manual'
                ? '你已允许本次风险动作，但需要你手动完成；AI 不会自动点击或提交。'
                : riskDecision === 'manual'
                  ? '你选择手动处理该风险动作。'
                  : '你已取消当前风险任务。'}
            </div>
          )}
          <div className={styles.runtimeActions}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => markRiskDecision('allowed_manual')}
            >
              允许本次，我手动完成
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => markRiskDecision('manual')}
            >
              我手动处理
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => updateTaskState('waiting_user_authorization')}
            >
              回到计划
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => markRiskDecision('cancelled')}
            >
              取消任务
            </button>
          </div>
        </div>
      )}
      {(selectedOptions.length > 0 || prices.length > 0 || riskyActions.length > 0) && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Selected</div>
            <div className={styles.summaryValue}>
              {selectedOptions.length > 0 ? selectedOptions.join(' / ') : 'None detected'}
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Price</div>
            <div className={styles.summaryValue}>
              {prices.length > 0
                ? prices.map((price) => `${price.label} ${price.value}`).join(' / ')
                : 'None detected'}
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Risk Gates</div>
            <div className={styles.summaryValue}>
              {riskyActions.length > 0
                ? riskyActions.map((action) => action.text).join(' / ')
                : 'No risky action visible'}
            </div>
          </div>
        </div>
      )}
      {(recentEvents.length > 0 || executionEvents.length > 0) && (
        <div aria-label="Browser action timeline" className={styles.timeline}>
          {executionEvents.map((event) => (
            <div className={styles.eventItem} key={event.id}>
              <span className={styles.eventStatus}>{event.status}</span>
              <span>{event.summary}</span>
            </div>
          ))}
          {recentEvents.map((event) => (
            <div className={styles.eventItem} key={event.id}>
              <span className={styles.eventStatus}>{event.status}</span>
              <span>{event.summary}</span>
            </div>
          ))}
        </div>
      )}
      {executionTimeline.length > 0 && (
        <div aria-label="Browser audit timeline" className={styles.timeline}>
          <div className={styles.timelineHeader}>
            <span>审计时间线</span>
            <span className={styles.pill}>session persisted</span>
          </div>
          {executionTimeline.map((event) => (
            <div className={styles.eventItem} key={`audit-${event.id}`}>
              <span className={styles.eventStatus}>{event.status}</span>
              <span>{event.summary}</span>
            </div>
          ))}
        </div>
      )}
      {(workflowHints.length > 0 || gaps.length > 0 || confirmationPoints.length > 0) && (
        <div className={styles.signalGrid}>
          {workflowHints.length > 0 && (
            <div className={styles.signalCard}>
              <div className={styles.signalLabel}>Workflow</div>
              <ul className={styles.list}>
                {workflowHints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div className={styles.signalCard}>
              <div className={styles.signalLabel}>Gaps</div>
              <ul className={styles.list}>
                {gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
          {confirmationPoints.length > 0 && (
            <div className={styles.signalCard}>
              <div className={styles.signalLabel}>Confirmations</div>
              <ul className={styles.list}>
                {confirmationPoints.map((point) => (
                  <li key={point.id}>
                    {point.title}
                    {point.reason ? ` - ${point.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {isIframeMode && iframeStatus === 'blocked' && (
        <div className={styles.notice}>
          This page did not finish loading in iframe mode. Switch to Remote if the page appears
          blank or blocked.
        </div>
      )}
      {displayUrl ? (
        <div
          className={`${styles.viewportFrame} ${isControlling ? styles.takeoverFrame : ''}`}
          data-agent-state={taskState}
          onClickCapture={pauseByIntervention}
          onKeyDownCapture={pauseByIntervention}
          onWheelCapture={pauseByIntervention}
        >
          {targetBoxVisible && (
            <div
              aria-label="Current browser target box"
              className={styles.targetBox}
              style={targetBoxStyle}
            >
              {targetLabel && (
                <span className={styles.targetBoxLabel}>AI 正在操作：{targetLabel}</span>
              )}
            </div>
          )}
          {isControlling && targetLabel && !targetBoxVisible && (
            <div aria-label="Current browser target" className={styles.targetHighlight}>
              AI 正在操作：{targetLabel}
            </div>
          )}
          <iframe
            className={styles.iframe}
            // The browser panel needs same-origin scripts for interactive iframe pages; remote mode is still used for blocked sites.
            // eslint-disable-next-line @eslint-react/dom/no-unsafe-iframe-sandbox
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            title={title ?? 'Browser'}
            src={
              isIframeMode
                ? displayUrl
                : `/api/browser/proxy?session=${encodeURIComponent(sessionId)}${
                    isControlling ? '&takeover=1' : ''
                  }`
            }
            onLoad={() => setIframeStatus('loaded')}
          />
        </div>
      ) : (
        <div className={styles.empty}>Navigate to a URL first. Ask the AI to open a webpage.</div>
      )}
      {showResult && result !== undefined && (
        <div className={styles.result}>
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </div>
      )}
    </Flexbox>
  );
});

BrowserPanel.displayName = 'BrowserPanel';

export default BrowserPanel;
