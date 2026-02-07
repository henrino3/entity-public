import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';

export default function MCTaskDetail() {
  return <MCFragment html={mcFragments.taskDetail} testId="mc-task-detail" />;
}
