import bridge, { UserInfo } from '@vkontakte/vk-bridge';
import { Avatar, Button, Caption, Div, Group as VKGroup, Header, Panel, PanelHeader, Progress, Text, Title } from '@vkontakte/vkui';
import { Icon28AddOutline, Icon28ShareOutline, Icon28Users3Outline } from '@vkontakte/icons';
import { Goal, NavIdProps } from '../types';
import { getDoneDays, getProgress, isDone, plural, toDateKey } from '../utils/goals';
import { createGoalInviteLink } from '../utils/invite';
import { getApiUserId } from '../api';

interface GroupProps extends NavIdProps {
  goals: Goal[];
  fetchedUser?: UserInfo;
  onCreateGoal: () => void;
  serverError: string;
  onNotice: (message: string) => void;
}

export const Group = ({ id, goals, fetchedUser, onCreateGoal, serverError, onNotice: setNotice }: GroupProps) => {
  const sharedGoals = goals.filter((goal) => goal.privacy === 'group');
  const currentUserId = getApiUserId(fetchedUser);

  const share = async (goal: Goal) => {
    const link = createGoalInviteLink(goal);
    try {
      if (bridge.isWebView()) {
        await bridge.send('VKWebAppShare', { link });
      } else if (navigator.share) {
        await navigator.share({ title: goal.title, text: 'Присоединяйся к моей цели. Мы увидим прогресс друг друга.', url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setNotice('Приглашение скопировано. Отправьте его другу.');
      }
    } catch {
      setNotice('Не удалось отправить приглашение. Попробуйте ещё раз.');
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader>Группа</PanelHeader>
      <Div>
        <div className="group-hero">
          <span className="group-hero__icon"><Icon28Users3Outline width={32} height={32} /></span>
          <Caption>ОДНА ЦЕЛЬ — СВОЙ ПРОГРЕСС</Caption>
          <Title level="1" weight="2">Видите результаты<br />и поддерживайте друг друга</Title>
          <Text>У каждого участника отдельные отметки и независимая история</Text>
          {/* With several goals the hero cannot know which one to share: each card has its own invite button. */}
          {sharedGoals.length === 1 ? (
            <Button className="group-invite" size="l" mode="secondary" before={<Icon28ShareOutline />} onClick={() => share(sharedGoals[0])}>Пригласить друга</Button>
          ) : (
            <Button className="group-invite" size="l" mode="secondary" before={<Icon28AddOutline />} onClick={onCreateGoal}>
              {sharedGoals.length ? 'Новая общая цель' : 'Создать общую цель'}
            </Button>
          )}
        </div>
      </Div>

      {serverError && <Div><Caption className="form-error">{serverError}</Caption></Div>}
      <VKGroup mode="plain" header={<Header size="s">Общие цели и участники</Header>}>
        <Div className="shared-goals-list">
          {sharedGoals.map((goal) => (
            <article className="shared-goal" key={goal.id}>
              <div className="shared-goal__header">
                <div><Title level="2" weight="2">{goal.title}</Title><Caption>Участников: {goal.participants?.length || 1}</Caption></div>
                <Button size="m" mode="secondary" before={<Icon28ShareOutline />} onClick={() => share(goal)}>Пригласить</Button>
              </div>
              <div className="member-list">
                {(goal.participants || []).map((participant) => {
                  const participantGoal = { ...goal, entries: participant.entries };
                  const done = isDone(participant.entries[toDateKey()]);
                  const progress = getProgress(participantGoal);
                  return (
                    <div className="member-card" key={participant.userId}>
                      <div className="member-card__header">
                        <Avatar size={44} src={participant.photoUrl} initials={participant.firstName.slice(0, 1)} gradientColor="blue" />
                        <div className="member-card__info">
                          <Title level="3" weight="2">{participant.userId === currentUserId ? 'Вы' : participant.firstName}</Title>
                          <Caption>{done ? 'Цель отмечена сегодня' : 'Сегодня ещё без отметки'}</Caption>
                        </div>
                        <span className={`member-status ${done ? 'member-status--done' : 'member-status--pending'}`}>{done ? 'Выполнено' : 'В процессе'}</span>
                      </div>
                      <Progress value={progress} aria-label={`Прогресс участника ${participant.firstName}`} />
                      <div className="member-card__footer"><Caption>{getDoneDays(participantGoal)} {plural(getDoneDays(participantGoal), ['успешный день', 'успешных дня', 'успешных дней'])}</Caption><strong>{progress}%</strong></div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
          {sharedGoals.length === 0 && (
            <div className="empty-state">
              <Title level="2" weight="2">Пока нет общих целей</Title>
              <Text>Создайте цель с друзьями и отправьте приглашение. После присоединения здесь появятся участники и их актуальный прогресс.</Text>
            </div>
          )}
        </Div>
      </VKGroup>
      <Div className="demo-note">
        <Text>Каждый отмечает только свой прогресс. Результаты участников обновляются автоматически.</Text>
      </Div>
    </Panel>
  );
};
