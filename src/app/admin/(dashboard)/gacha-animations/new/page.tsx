import { AnimationForm } from "../AnimationForm";

export default function NewGachaAnimationPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">動画演出を新規登録</h1>
      <AnimationForm mode="create" />
    </div>
  );
}
