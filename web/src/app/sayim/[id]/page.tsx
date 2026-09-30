import SayimSayfa from "@/components/sayim/SayimSayfa";

export const metadata = { title: "Sayım · Namlab" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SayimSayfa id={id} />;
}
