import { Div, Panel, PanelHeader, PanelHeaderBack, Text } from '@vkontakte/vkui';
import { useParams } from '@vkontakte/vk-mini-apps-router';
import { useSafeBack } from '../hooks/useSafeBack';
import { Goal, GoalDraft, NavIdProps } from '../types';
import { CreateGoal } from './CreateGoal';

interface EditGoalProps extends NavIdProps {
  goals: Goal[];
  loading?: boolean;
  onSave: (id: string, draft: GoalDraft) => Promise<void>;
}

/** The creation form in edit mode for the goal from the /edit/:id route. */
export const EditGoal = ({ id, goals, loading, onSave }: EditGoalProps) => {
  const goBack = useSafeBack();
  const params = useParams<'id'>();
  const goal = goals.find((item) => item.id === params?.id);

  if (!goal) {
    return (
      <Panel id={id}>
        <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>Изменить цель</PanelHeader>
        <Div className="empty-state"><Text>{loading ? 'Загружаем цель…' : 'Цель не найдена.'}</Text></Div>
      </Panel>
    );
  }

  // key: a fresh form for each goal, so the fields start from that goal's values.
  return <CreateGoal key={goal.id} id={id} goal={goal} onCreate={(draft) => onSave(goal.id, draft)} />;
};
