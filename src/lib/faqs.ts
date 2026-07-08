import { createSupabaseServerClient } from "@/lib/supabase-server";

export type Faq = {
  id: string;
  question: string;
  answer: string;
  display_order: number;
};

export async function getFaqs(): Promise<Faq[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("faqs")
    .select("id, question, answer, display_order")
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
