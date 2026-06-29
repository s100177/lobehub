import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const BrowserE2EFixture = () => {
  if (process.env.ENABLE_BROWSER_E2E_TEST_PANEL !== '1') notFound();

  return (
    <main
      style={{
        background: '#f8fafc',
        color: '#0f172a',
        display: 'grid',
        fontFamily: 'sans-serif',
        gap: 18,
        minHeight: '100vh',
        padding: 32,
      }}
    >
      <h1>云服务器购买</h1>
      <p>场景：个人建站。请根据预算读取配置并停在提交订单前。</p>
      <section
        style={{
          background: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: 16,
          display: 'grid',
          gap: 10,
          padding: 18,
        }}
      >
        <h2>地域选择</h2>
        <button className="selected" id="region-nanjing" type="button">
          南京
        </button>
        <button id="region-shanghai" type="button">
          上海
        </button>
      </section>
      <section
        style={{
          background: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: 16,
          display: 'grid',
          gap: 10,
          padding: 18,
        }}
      >
        <h2>实例规格</h2>
        <label htmlFor="instance">
          实例规格{' '}
          <select id="instance" name="instance">
            <option>2核4GB</option>
            <option>4核8GB</option>
          </select>
        </label>
        <strong id="price">配置费用 ¥114.36 / 月</strong>
        <button
          id="buy"
          type="button"
          style={{
            background: '#b91c1c',
            border: 0,
            borderRadius: 10,
            color: '#fff',
            cursor: 'pointer',
            padding: '10px 12px',
            width: 'max-content',
          }}
        >
          立即购买
        </button>
      </section>
    </main>
  );
};

export default BrowserE2EFixture;
