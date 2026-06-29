import { notFound } from 'next/navigation';

import BrowserE2EPanel from './BrowserE2EPanel';

export const dynamic = 'force-dynamic';

const Page = () => {
  if (process.env.ENABLE_BROWSER_E2E_TEST_PANEL !== '1') notFound();

  return <BrowserE2EPanel />;
};

export default Page;
