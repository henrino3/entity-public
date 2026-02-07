import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';
import MCRightSidebar from './MCRightSidebar';
import MCTaskCard from './MCTaskCard';

export default function MCOpsView() {
  return (
    <>
      <MCRightSidebar />
      <MCFragment html={mcFragments.opsView} testId="mc-ops-view" />
      <MCTaskCard />
    </>
  );
}
