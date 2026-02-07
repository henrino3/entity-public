import { useEffect, useRef, useState } from 'react';
import MCHeader from './mission-control/MCHeader';
import MCFilterBar from './mission-control/MCFilterBar';
import MCOpsView from './mission-control/MCOpsView';
import MCStrategicView from './mission-control/MCStrategicView';
import MCAgentsView from './mission-control/MCAgentsView';
import MCModals from './mission-control/MCModals';
import { useMCData } from '../hooks/useMCData';
import type { TaskBoardTask, TaskColumn, CreateTaskPayload } from '../hooks/useTaskBoard';

export type MCViewport = 'desktop' | 'tablet' | 'mobile';

interface TaskBoardProps {
  viewport: MCViewport;
  apiBase?: string;
  tasks?: TaskBoardTask[];
  columns?: readonly TaskColumn[];
  loading?: boolean;
  error?: string | null;
  onCreateTask?: (payload: CreateTaskPayload) => Promise<unknown>;
  onMoveTask?: (taskId: number, column: TaskColumn) => Promise<unknown>;
  highlightTaskId?: number | null;
}

function isViewportMatch(viewport: MCViewport, width: number): boolean {
  if (viewport === 'desktop') {
    return width >= 1024;
  }

  if (viewport === 'tablet') {
    return width >= 768 && width < 1024;
  }

  return width < 768;
}

export default function TaskBoard({ viewport }: TaskBoardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [activeViewport, setActiveViewport] = useState(false);

  useEffect(() => {
    setMounted(true);

    const updateViewport = () => {
      setActiveViewport(isViewportMatch(viewport, window.innerWidth));
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, [viewport]);

  useMCData(rootRef, mounted && activeViewport);

  if (!mounted || !activeViewport) {
    return null;
  }

  return (
    <div ref={rootRef} className="mc-root h-full overflow-auto bg-[var(--bg-primary)] text-[var(--text-secondary)]">
      <MCHeader />
      <MCFilterBar />
      <MCOpsView />
      <MCStrategicView />
      <MCAgentsView />
      <MCModals />
    </div>
  );
}
