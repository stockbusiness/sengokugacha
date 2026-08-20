import { describe, expect, it } from "vitest";
import { gradeAnswers, toPublicQuestion, type GradableQuestion } from "./grading";

function quiz(id: string, correct: string[], choices: string[]): GradableQuestion {
  return { id, questionType: "quiz", isRequired: true, choiceIds: choices, correctChoiceIds: correct };
}

describe("gradeAnswers", () => {
  it("クイズに正解すると正解数に数える", () => {
    const result = gradeAnswers(
      [quiz("q1", ["c1"], ["c1", "c2"])],
      [{ questionId: "q1", choiceIds: ["c1"], freeText: null }]
    );
    expect(result.correctAnswerCount).toBe(1);
    expect(result.perQuestion[0]).toEqual({ questionId: "q1", answered: true, isCorrect: true });
  });

  it("クイズに不正解なら正解数に数えない", () => {
    const result = gradeAnswers(
      [quiz("q1", ["c1"], ["c1", "c2"])],
      [{ questionId: "q1", choiceIds: ["c2"], freeText: null }]
    );
    expect(result.correctAnswerCount).toBe(0);
    expect(result.perQuestion[0].isCorrect).toBe(false);
  });

  it("未回答のクイズは正解にしない", () => {
    const result = gradeAnswers([quiz("q1", ["c1"], ["c1", "c2"])], []);
    expect(result.perQuestion[0]).toEqual({ questionId: "q1", answered: false, isCorrect: false });
    expect(result.correctAnswerCount).toBe(0);
  });

  it("複数正解のクイズは集合が完全一致したときだけ正解にする", () => {
    const question = quiz("q1", ["c1", "c2"], ["c1", "c2", "c3"]);
    const both = gradeAnswers([question], [{ questionId: "q1", choiceIds: ["c2", "c1"], freeText: null }]);
    expect(both.perQuestion[0].isCorrect).toBe(true);

    // 片方だけでは不正解。選択したこと自体は「回答済み」として扱うが、
    // 部分一致を正解にはしない。
    const partial = gradeAnswers([question], [{ questionId: "q1", choiceIds: ["c1"], freeText: null }]);
    expect(partial.perQuestion[0]).toMatchObject({ answered: true, isCorrect: false });

    const extra = gradeAnswers([question], [{ questionId: "q1", choiceIds: ["c1", "c2", "c3"], freeText: null }]);
    expect(extra.perQuestion[0].isCorrect).toBe(false);
  });

  it("アンケート(単一選択)は正誤を判定しない", () => {
    const result = gradeAnswers(
      [{ id: "q1", questionType: "single", isRequired: true, choiceIds: ["c1", "c2"], correctChoiceIds: [] }],
      [{ questionId: "q1", choiceIds: ["c1"], freeText: null }]
    );
    expect(result.perQuestion[0]).toEqual({ questionId: "q1", answered: true, isCorrect: null });
    expect(result.correctAnswerCount).toBe(0);
  });

  it("単一選択に複数送られてきたら回答として扱わない", () => {
    const result = gradeAnswers(
      [{ id: "q1", questionType: "single", isRequired: true, choiceIds: ["c1", "c2"], correctChoiceIds: [] }],
      [{ questionId: "q1", choiceIds: ["c1", "c2"], freeText: null }]
    );
    expect(result.perQuestion[0].answered).toBe(false);
  });

  it("複数選択は1つ以上選べば回答済みにする", () => {
    const result = gradeAnswers(
      [{ id: "q1", questionType: "multi", isRequired: true, choiceIds: ["c1", "c2"], correctChoiceIds: [] }],
      [{ questionId: "q1", choiceIds: ["c1", "c2"], freeText: null }]
    );
    expect(result.perQuestion[0]).toEqual({ questionId: "q1", answered: true, isCorrect: null });
  });

  it("自由記述は空白だけなら未回答にする", () => {
    const question: GradableQuestion = {
      id: "q1",
      questionType: "free_text",
      isRequired: true,
      choiceIds: [],
      correctChoiceIds: [],
    };
    const blank = gradeAnswers([question], [{ questionId: "q1", choiceIds: [], freeText: "　 " }]);
    expect(blank.perQuestion[0].answered).toBe(false);

    const filled = gradeAnswers([question], [{ questionId: "q1", choiceIds: [], freeText: "面白かった" }]);
    expect(filled.perQuestion[0].answered).toBe(true);
  });

  it("必須設問だけを回答数に数える", () => {
    const result = gradeAnswers(
      [
        { id: "q1", questionType: "single", isRequired: true, choiceIds: ["c1"], correctChoiceIds: [] },
        { id: "q2", questionType: "free_text", isRequired: false, choiceIds: [], correctChoiceIds: [] },
      ],
      [{ questionId: "q1", choiceIds: ["c1"], freeText: null }]
    );
    expect(result.requiredQuestionCount).toBe(1);
    expect(result.answeredRequiredQuestionCount).toBe(1);
  });

  it("任意項目に答えても必須の回答数は増えない", () => {
    const result = gradeAnswers(
      [
        { id: "q1", questionType: "single", isRequired: true, choiceIds: ["c1"], correctChoiceIds: [] },
        { id: "q2", questionType: "free_text", isRequired: false, choiceIds: [], correctChoiceIds: [] },
      ],
      [{ questionId: "q2", choiceIds: [], freeText: "感想" }]
    );
    expect(result.answeredRequiredQuestionCount).toBe(0);
  });

  // 教材が新バージョンへ差し替わった後、古い画面から送信された場合を想定する。
  it("このバージョンに無い設問IDを報告する", () => {
    const result = gradeAnswers(
      [quiz("q1", ["c1"], ["c1"])],
      [
        { questionId: "q1", choiceIds: ["c1"], freeText: null },
        { questionId: "q-old", choiceIds: ["c9"], freeText: null },
      ]
    );
    expect(result.unknownQuestionIds).toEqual(["q-old"]);
  });

  it("その設問に属さない選択肢が混ざっていたら報告する", () => {
    const result = gradeAnswers(
      [quiz("q1", ["c1"], ["c1", "c2"])],
      [{ questionId: "q1", choiceIds: ["c9"], freeText: null }]
    );
    expect(result.invalidChoiceQuestionIds).toEqual(["q1"]);
  });

  it("設問が0件なら何も数えない", () => {
    const result = gradeAnswers([], []);
    expect(result).toMatchObject({
      requiredQuestionCount: 0,
      answeredRequiredQuestionCount: 0,
      correctAnswerCount: 0,
    });
  });
});

// 指示書§11「クイズの正解を回答前のフロントへ送らない」。
describe("toPublicQuestion", () => {
  it("正解フラグを落として返す", () => {
    const result = toPublicQuestion({
      id: "q1",
      question_type: "quiz",
      is_required: true,
      body: "千ノ国とは何か",
      choices: [
        { id: "c1", body: "正しい説明", is_correct: true },
        { id: "c2", body: "誤った説明", is_correct: false },
      ],
    });

    expect(result.choices).toEqual([
      { id: "c1", body: "正しい説明" },
      { id: "c2", body: "誤った説明" },
    ]);
    // 念のため、シリアライズしても正解が漏れないことを確認する。
    expect(JSON.stringify(result)).not.toContain("is_correct");
    expect(JSON.stringify(result)).not.toContain("isCorrect");
  });
});
