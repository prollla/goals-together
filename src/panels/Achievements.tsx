import { Button, Div, Panel, PanelHeader, PanelHeaderBack, Progress } from '@vkontakte/vkui';
import { useSafeBack } from '../hooks/useSafeBack';
import { NavIdProps } from '../types';
import { Achievement } from '../utils/achievements';
import { shareStory } from '../utils/story';

interface AchievementsProps extends NavIdProps {
  achievements: Achievement[];
  onNotice: (message: string) => void;
}

export const Achievements = ({ id, achievements, onNotice }: AchievementsProps) => {
  const goBack = useSafeBack();
  const unlocked = achievements.filter((achievement) => achievement.unlocked).length;

  const share = async (achievement: Achievement) => {
    try {
      const result = await shareStory({ emoji: achievement.emoji, title: achievement.title, subtitle: achievement.description });
      if (result === 'downloaded') onNotice('Картинка для истории сохранена');
    } catch {
      // The user closed the story editor or VK refused: nothing to report.
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>Достижения</PanelHeader>
      <Div>
        <div className="achievements-summary">
          <strong>{unlocked} из {achievements.length}</strong>
          <span>Открывайте новые, отмечая цели каждый день</span>
          <Progress value={Math.round((unlocked / achievements.length) * 100)} aria-label="Открыто достижений" />
        </div>
      </Div>
      <Div className="achievements-grid">
        {achievements.map((achievement) => (
          <article key={achievement.id} className={`achievement ${achievement.unlocked ? 'achievement--unlocked' : ''}`}>
            <span className="achievement__emoji" aria-hidden>{achievement.emoji}</span>
            <h3 className="achievement__title">{achievement.title}</h3>
            <p className="achievement__description">{achievement.description}</p>
            {achievement.unlocked ? (
              <Button size="s" mode="secondary" onClick={() => void share(achievement)}>В историю</Button>
            ) : (
              <div className="achievement__progress">
                <Progress value={Math.round((achievement.current / achievement.target) * 100)} aria-label={`Прогресс: ${achievement.title}`} />
                <span>{achievement.current} / {achievement.target}</span>
              </div>
            )}
          </article>
        ))}
      </Div>
    </Panel>
  );
};
