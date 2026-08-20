// 回答の検証と採点。DB非依存の純粋関数だけを置く。
//
// 指示書§11「クイズの正解を回答前のフロントへ送らない」「すべての完了判定を
// サーバー側で行う」に対応する。正解の情報はこの層より上(参加者向けAPIのレスポンス)へ
// 出してはならない。

export type QuestionType = "quiz" | "single" | "multi" | "free_text";

export type GradableQuestion = {
  id: string;
  questionType: QuestionType;
  isRequired: boolean;
  // その設問に属する選択肢のID全部。送られてきた選択肢がこの設問のものかを検証する。
  choiceIds: string[];
  // 正解の選択肢ID。quiz以外では空配列。
  correctChoiceIds: string[];
};

export type SubmittedAnswer = {
  questionId: string;
  // 単一選択でも配列で受け取る(複数選択と同じ形にして呼び出し側を単純にする)。
  choiceIds: string[];
  freeText: string | null;
};

export type QuestionGrade = {
  questionId: string;
  answered: boolean;
  // 採点対象(quiz)のみ true/false。アンケート・自由記述は null(正誤の概念が無い)。
  isCorrect: boolean | null;
};

export type GradingResult = {
  perQuestion: QuestionGrade[];
  requiredQuestionCount: number;
  answeredRequiredQuestionCount: number;
  correctAnswerCount: number;
  // このバージョンに存在しない設問ID。教材が差し替わった後の古い画面からの送信で起こりうる。
  unknownQuestionIds: string[];
  // その設問に属さない選択肢IDが混ざっていた設問。
  invalidChoiceQuestionIds: string[];
};

function isAnswered(question: GradableQuestion, answer: SubmittedAnswer | undefined): boolean {
  if (!answer) return false;
  if (question.questionType === "free_text") {
    return (answer.freeText ?? "").trim().length > 0;
  }
  if (question.questionType === "single") {
    // 単一選択に複数送られてきた場合は「回答」として扱わない(不正な入力)。
    return answer.choiceIds.length === 1;
  }
  // quiz は正解が複数ある場合があるため、選択数を1に縛らない
  // (選んだ集合が正解の集合と一致するかは isCorrect() 側で判定する)。
  return answer.choiceIds.length > 0;
}

// quizの正誤は「選んだ選択肢の集合が正解の集合と完全一致するか」で判定する。
// 単一選択のquizであれば実質1対1の比較になる。
function isCorrect(question: GradableQuestion, answer: SubmittedAnswer): boolean {
  if (question.correctChoiceIds.length === 0) return false;
  const selected = new Set(answer.choiceIds);
  if (selected.size !== question.correctChoiceIds.length) return false;
  return question.correctChoiceIds.every((id) => selected.has(id));
}

export function gradeAnswers(questions: GradableQuestion[], answers: SubmittedAnswer[]): GradingResult {
  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const questionIds = new Set(questions.map((question) => question.id));

  const unknownQuestionIds = answers
    .map((answer) => answer.questionId)
    .filter((id) => !questionIds.has(id));

  const invalidChoiceQuestionIds: string[] = [];
  const perQuestion: QuestionGrade[] = [];
  let requiredQuestionCount = 0;
  let answeredRequiredQuestionCount = 0;
  let correctAnswerCount = 0;

  for (const question of questions) {
    if (question.isRequired) requiredQuestionCount += 1;

    const answer = answerByQuestionId.get(question.id);
    if (answer) {
      const allowed = new Set(question.choiceIds);
      if (answer.choiceIds.some((id) => !allowed.has(id))) {
        invalidChoiceQuestionIds.push(question.id);
      }
    }

    const answered = isAnswered(question, answer);
    if (answered && question.isRequired) answeredRequiredQuestionCount += 1;

    let correct: boolean | null = null;
    if (question.questionType === "quiz") {
      correct = answered && answer ? isCorrect(question, answer) : false;
      if (correct) correctAnswerCount += 1;
    }

    perQuestion.push({ questionId: question.id, answered, isCorrect: correct });
  }

  return {
    perQuestion,
    requiredQuestionCount,
    answeredRequiredQuestionCount,
    correctAnswerCount,
    unknownQuestionIds,
    invalidChoiceQuestionIds,
  };
}

// 参加者向けAPIへ返してよい形へ落とす。正解の選択肢IDは含めない
// (採点結果として「その設問に正解したか」だけを返す)。
export type PublicQuestion = {
  id: string;
  questionType: QuestionType;
  isRequired: boolean;
  body: string;
  choices: { id: string; body: string }[];
};

export function toPublicQuestion(question: {
  id: string;
  question_type: string;
  is_required: boolean;
  body: string;
  choices: { id: string; body: string; is_correct: boolean }[];
}): PublicQuestion {
  return {
    id: question.id,
    questionType: question.question_type as QuestionType,
    isRequired: question.is_required,
    body: question.body,
    // is_correct をここで確実に落とす。呼び出し側が選択肢をそのまま渡してしまう事故を防ぐ。
    choices: question.choices.map((choice) => ({ id: choice.id, body: choice.body })),
  };
}
