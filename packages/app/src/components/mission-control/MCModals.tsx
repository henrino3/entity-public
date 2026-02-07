import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';
import MCTaskDetail from './MCTaskDetail';

export default function MCModals() {
  return (
    <>
      <MCFragment html={mcFragments.addTaskModal} testId="mc-add-task-modal" />
      <MCFragment html={mcFragments.settingsModal} testId="mc-settings-modal" />
      <MCTaskDetail />
      <MCFragment html={mcFragments.loginOverlay} testId="mc-login-overlay" />
    </>
  );
}
