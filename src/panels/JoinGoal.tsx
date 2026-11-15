import { useEffect, useState } from 'react';
import { UserInfo } from '@vkontakte/vk-bridge';
import { Button, Caption, Div, Panel, PanelHeader, PanelHeaderBack, Text, Title } from '@vkontakte/vkui';
import { GoalDraft, NavIdProps } from '../types';
import { GoalTypeIcon } from '../components/GoalTypeIcon';
import { getInvitation } from '../api';
import { plural } from '../utils/goals';

interface JoinGoalProps extends NavIdProps {
  groupId?: string | null;
  fetchedUser?: UserInfo;
  onAccept: (groupId: string) => Promise<void>;
  onDismiss: () => void;
}

type Invitation = GoalDraft & { participantCount: number };

export const JoinGoal = ({ id, groupId, fetchedUser, onAccept, onDismiss }: JoinGoalProps) => {
  const [invitation, setInvitation] = useState<Invitation>();
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setError('');
    getInvitation(groupId, fetchedUser)
      .then((data) => { if (active) setInvitation(data); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [fetchedUser, groupId]);

  const accept = async () => {
    if (!groupId) return;
    setAccepting(true);
    try {
      await onAccept(groupId);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={onDismiss} />}>Приглашение</PanelHeader>
      {groupId && !error ? (
        <>
          <Div className="join-intro">
            <Caption>ОБЩАЯ ЦЕЛЬ</Caption>
            <Title level="1" weight="2">Одна цель — прогресс каждого участника</Title>
            <Text>Вы увидите отметки друг друга, но вести календарь и серию будете самостоятельно.</Text>
          </Div>
          {invitation ? (
            <>
              <Div>
                <article className={`invite-goal invite-goal--${invitation.color}`}>
                  <span className="invite-goal__icon"><GoalTypeIcon type={invitation.type} size={30} /></span>
                  <Caption>{invitation.category}</Caption>
                  <Title level="2" weight="2">{invitation.title}</Title>
                  <Text>{invitation.rule}</Text>
                  <div className="invite-goal__details">
                    {invitation.duration > 0 && <Caption>Срок: {invitation.duration} {plural(invitation.duration, ['день', 'дня', 'дней'])}</Caption>}
                    {invitation.type === 'quantity' && <Caption>Результат: {invitation.target} {invitation.unit}</Caption>}
                    <Caption>Уже участвует: {invitation.participantCount}</Caption>
                  </div>
                </article>
              </Div>
              <Div className="join-benefits">
                <Text>После присоединения:</Text>
                <ul>
                  <li>цель появится в вашем списке;</li>
                  <li>ваши отметки будут видны другим участникам;</li>
                  <li>их прогресс появится в разделе «Группа».</li>
                </ul>
              </Div>
              <Div>
                <Button stretched size="l" loading={accepting} onClick={() => void accept()}>Присоединиться к цели</Button>
                <Button stretched size="m" mode="tertiary" onClick={onDismiss}>Не сейчас</Button>
              </Div>
            </>
          ) : (
            <Div className="empty-state"><Text>Загружаем информацию о цели…</Text></Div>
          )}
        </>
      ) : (
        <Div className="empty-state">
          <Title level="2" weight="2">Приглашение недоступно</Title>
          <Text>{error || 'Ссылка устарела или открыта не полностью. Попросите друга отправить приглашение ещё раз.'}</Text>
          <Button size="l" onClick={onDismiss}>На главную</Button>
        </Div>
      )}
    </Panel>
  );
};
