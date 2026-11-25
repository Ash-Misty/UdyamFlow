import { CircleAlert, CircleCheck } from 'lucide-react';

export function Feedback({ error, success }) {
  if (!error && !success) return null;
  return (
    <div className={`feedback ${error ? 'feedback-error' : 'feedback-success'}`} role="status">
      {error ? <CircleAlert size={17} /> : <CircleCheck size={17} />}
      <span>{error || success}</span>
    </div>
  );
}
