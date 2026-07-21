'use client';

import { installBrowserBridge } from '@lobechat/builtin-tool-browser/bridge';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

const fieldStyle = {
  display: 'grid',
  gap: 8,
} satisfies CSSProperties;

const inputStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 12,
  fontSize: 16,
  padding: '12px 14px',
} satisfies CSSProperties;

const Page = () => {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (window.parent === window) return;

    return installBrowserBridge();
  }, []);

  return (
    <main
      style={{
        background:
          'radial-gradient(circle at 12% 12%, #dbeafe 0, transparent 28%), linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
        color: '#0f172a',
        display: 'grid',
        fontFamily: 'Avenir Next, ui-sans-serif, system-ui, sans-serif',
        gap: 24,
        minHeight: '100vh',
        padding: 32,
      }}
    >
      <section
        style={{
          background: 'rgba(255, 255, 255, 0.86)',
          border: '1px solid rgba(148, 163, 184, 0.34)',
          borderRadius: 28,
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.12)',
          display: 'grid',
          gap: 22,
          margin: '0 auto',
          maxWidth: 760,
          padding: 28,
          width: '100%',
        }}
      >
        <header style={{ display: 'grid', gap: 8 }}>
          <p
            style={{
              color: '#2563eb',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1.8,
              margin: 0,
              textTransform: 'uppercase',
            }}
          >
            Browser Agent Demo
          </p>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: 0 }}>费用审批</h1>
          <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.7, margin: 0 }}>
            报销金额 ¥128.00。请补齐部门并在提交审批前停下。
          </p>
          <a
            href="/browser-business-demo/expense-approval?view=policy"
            target="_blank"
            style={{
              color: '#1d4ed8',
              fontWeight: 800,
              width: 'max-content',
            }}
          >
            新标签打开报销制度
          </a>
        </header>

        <form
          data-submitted={submitted ? '1' : undefined}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 22,
            display: 'grid',
            gap: 18,
            padding: 22,
          }}
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            document.body.dataset.submitted = '1';
          }}
        >
          <label htmlFor="department" style={fieldStyle}>
            <span style={{ color: '#334155', fontWeight: 700 }}>报销部门</span>
            <select id="department" name="department" style={inputStyle} title="报销部门">
              <option value="">请选择</option>
              <option value="研发部">研发部</option>
              <option value="市场部">市场部</option>
              <option value="财务部">财务部</option>
            </select>
          </label>

          <label htmlFor="reason" style={fieldStyle}>
            <span style={{ color: '#334155', fontWeight: 700 }}>报销原因</span>
            <input
              defaultValue="客户现场支持"
              id="reason"
              name="reason"
              style={inputStyle}
              title="报销原因"
            />
          </label>

          <section
            aria-label="费用摘要"
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 18,
              display: 'grid',
              gap: 8,
              padding: 16,
            }}
          >
            <span style={{ color: '#475569' }}>报销金额</span>
            <strong style={{ color: '#1d4ed8', fontSize: 28 }}>报销金额 ¥128.00</strong>
          </section>

          {submitted ? (
            <p
              role="status"
              style={{
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: 14,
                color: '#991b1b',
                margin: 0,
                padding: 12,
              }}
            >
              表单已提交。自动化 evidence 测试不应触发这个状态。
            </p>
          ) : null}

          <button
            className="risk"
            id="submit-expense"
            type="submit"
            style={{
              background: 'linear-gradient(135deg, #dc2626, #991b1b)',
              border: 0,
              borderRadius: 16,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 800,
              padding: '14px 18px',
              width: 'max-content',
            }}
          >
            提交审批
          </button>
        </form>
      </section>
    </main>
  );
};

export default Page;
