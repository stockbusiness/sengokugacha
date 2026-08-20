"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { RewardBadge, type RewardDisplay } from "@/components/journey/JourneyPieces";
import { toDisplayUrl } from "@/lib/image-url";

type PublicQuestion = {
  id: string;
  questionType: "quiz" | "single" | "multi" | "free_text";
  isRequired: boolean;
  body: string;
  choices: { id: string; body: string }[];
};

type MissionDetail = {
  id: string;
  title: string;
  available: boolean;
  unavailableReason: string | null;
  status: "not_started" | "in_progress" | "completed";
  bodyText: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  videoAltText: string | null;
  questions: PublicQuestion[];
  savedAnswers: { questionId: string; choiceIds: string[]; freeText: string | null }[];
  allowSelfReport: boolean;
  reward: RewardDisplay;
};

type SubmitResult = {
  completed: boolean;
  source: "ANSWERED" | "SELF_REPORTED";
  unmet: string[];
  graded: { questionId: string; isCorrect: boolean | null }[];
};

const UNMET_LABEL: Record<string, string> = {
  content_not_viewed: "教材をご覧ください",
  questions_unanswered: "未回答の設問があります",
  not_enough_correct: "もう一度お答えください",
  achievement_not_verified: "体験の記録が確認できていません",
};

export default function JourneyMissionPage() {
  const { missionId } = useParams<{ missionId: string }>();
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, { choiceIds: string[]; freeText: string }>>({});
  const [selfReported, setSelfReported] = useState(false);
  // 動画を見られない場合の代替を、利用者が自分で開けるようにする(指示書§12)。
  const [showAlternative, setShowAlternative] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/journey/missions/${missionId}`);
    if (!res.ok) throw new Error("ミッションを読み込めませんでした。");
    const data: MissionDetail = await res.json();
    setMission(data);

    const initial: Record<string, { choiceIds: string[]; freeText: string }> = {};
    for (const saved of data.savedAnswers) {
      initial[saved.questionId] = { choiceIds: saved.choiceIds, freeText: saved.freeText ?? "" };
    }
    setAnswers(initial);
    setStatus("ready");
  }, [missionId]);

  useEffect(() => {
    let cancelled = false;
    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return load().then(() => {
          // 教材を開いたことを記録する。失敗しても閲覧は妨げない。
          fetch(`/api/journey/missions/${missionId}/view`, { method: "POST" }).catch(() => {
            /* 記録の失敗は表示に影響させない */
          });
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [missionId, load]);

  function toggleChoice(question: PublicQuestion, choiceId: string) {
    setAnswers((prev) => {
      const current = prev[question.id] ?? { choiceIds: [], freeText: "" };
      // 複数選択だけが積み上げ。単一選択・クイズは選び直しで置き換える。
      const choiceIds =
        question.questionType === "multi"
          ? current.choiceIds.includes(choiceId)
            ? current.choiceIds.filter((id) => id !== choiceId)
            : [...current.choiceIds, choiceId]
          : [choiceId];
      return { ...prev, [question.id]: { ...current, choiceIds } };
    });
  }

  function setFreeText(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { choiceIds: prev[questionId]?.choiceIds ?? [], freeText: value },
    }));
  }

  async function handleSubmit() {
    if (!mission) return;
    setSubmitting(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const res = await fetch(`/api/journey/missions/${mission.id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: mission.questions.map((question) => ({
            questionId: question.id,
            choiceIds: answers[question.id]?.choiceIds ?? [],
            freeText: answers[question.id]?.freeText ?? null,
          })),
          selfReported,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "送信に失敗しました。");
      setResult(data as SubmitResult);
      // 完了状態を画面へ反映する(再送しても結果は変わらない)。
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "送信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  const imageUrl = toDisplayUrl(mission?.imageUrl ?? null);
  const videoUrl = toDisplayUrl(mission?.videoUrl ?? null);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-base text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && mission && (
        <div className="space-y-5">
          <PageHeader title={mission.title} />

          {!mission.available && (
            <Card className="border-gold/40 text-center text-base text-parchment-dim">
              {mission.unavailableReason ?? "現在ご利用いただけません。"}
            </Card>
          )}

          {/* 教材 */}
          {videoUrl && (
            <div className="overflow-hidden rounded-2xl border border-gold/15 bg-ink">
              <video src={videoUrl} controls playsInline className="w-full" />
            </div>
          )}

          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-full rounded-2xl border border-gold/15" />
          )}

          {mission.bodyText && (
            <Card className="whitespace-pre-wrap text-base leading-loose text-parchment">{mission.bodyText}</Card>
          )}

          {/* 動画を再生できない環境向けの代替(指示書§12) */}
          {videoUrl && mission.videoAltText && (
            <Card>
              <button
                onClick={() => setShowAlternative((prev) => !prev)}
                className="w-full py-2 text-left text-base text-gold-soft underline decoration-gold/30 underline-offset-4"
              >
                動画が見られない方はこちら {showAlternative ? "▲" : "▼"}
              </button>
              {showAlternative && (
                <p className="mt-3 whitespace-pre-wrap text-base leading-loose text-parchment-dim">
                  {mission.videoAltText}
                </p>
              )}
            </Card>
          )}

          {/* 設問 */}
          {mission.questions.map((question) => {
            const grade = result?.graded.find((g) => g.questionId === question.id);
            return (
              <Card key={question.id} className="space-y-3">
                <p className="text-base font-semibold leading-relaxed text-parchment">
                  {question.body}
                  {!question.isRequired && <span className="ml-2 text-sm text-parchment-dim">(任意)</span>}
                </p>

                {question.questionType === "free_text" ? (
                  <textarea
                    value={answers[question.id]?.freeText ?? ""}
                    onChange={(e) => setFreeText(question.id, e.target.value)}
                    rows={4}
                    disabled={!mission.available}
                    className="w-full rounded-lg border border-gold/20 bg-ink px-3 py-3 text-base text-parchment disabled:opacity-50"
                  />
                ) : (
                  <div className="space-y-2">
                    {question.choices.map((choice) => {
                      const selected = (answers[question.id]?.choiceIds ?? []).includes(choice.id);
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() => toggleChoice(question, choice.id)}
                          disabled={!mission.available}
                          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-4 text-left text-base transition disabled:opacity-50 ${
                            selected
                              ? "border-gold/60 bg-gold/10 text-parchment"
                              : "border-gold/20 bg-ink text-parchment-dim hover:border-gold/40"
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              selected ? "border-gold bg-gold/30 text-parchment" : "border-gold/30"
                            }`}
                          >
                            {selected ? "✓" : ""}
                          </span>
                          <span className="leading-snug">{choice.body}</span>
                        </button>
                      );
                    })}
                    {question.questionType === "multi" && (
                      <p className="text-sm text-parchment-dim">あてはまるものをいくつでもお選びください</p>
                    )}
                  </div>
                )}

                {/* 送信後の採点結果。正解そのものは表示しない */}
                {grade?.isCorrect === true && <p className="text-base text-gold-soft">正解です</p>}
                {grade?.isCorrect === false && (
                  <p className="text-base text-parchment-dim">もう一度お考えください</p>
                )}
              </Card>
            );
          })}

          {/* 外部の体験実績を確認できないため、本人の申告で完了できるようにする(指示書§6) */}
          {mission.allowSelfReport && (
            <Card>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selfReported}
                  onChange={(e) => setSelfReported(e.target.checked)}
                  disabled={!mission.available}
                  className="mt-1 h-6 w-6 shrink-0"
                />
                <span className="text-base leading-relaxed text-parchment">体験してみました</span>
              </label>
            </Card>
          )}

          {/* 結果 */}
          {result?.completed && (
            <Card highlight className="text-center">
              <p className="text-xl font-bold text-gold-soft">このミッションは完了です</p>
              <div className="mt-2">
                <RewardBadge reward={mission.reward} />
              </div>
            </Card>
          )}

          {result && !result.completed && result.unmet.length > 0 && (
            <Card className="border-gold/40">
              <p className="text-base text-parchment">つぎのことをお願いします</p>
              <ul className="mt-2 space-y-1">
                {result.unmet.map((reason) => (
                  <li key={reason} className="text-base text-parchment-dim">
                    ・{UNMET_LABEL[reason] ?? reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {errorMessage && <p className="text-base text-crimson-dark">{errorMessage}</p>}

          {mission.available && (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "送信しています..." : mission.status === "completed" ? "回答を送り直す" : "この内容で送る"}
            </Button>
          )}

          {/* 「あとで続ける」を明確にする(指示書§12) */}
          <Button variant="secondary" onClick={() => router.push("/journey")}>
            あとで続ける
          </Button>

          <div className="pt-2">
            <TextLink href="/journey/missions">← ミッション一覧へ</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
