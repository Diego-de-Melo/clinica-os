import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Stethoscope, ShieldCheck, Users, FileCheck2, MessageCircle } from "lucide-react";
import { WHATSAPP_SUPPORT_NUMBER } from "@/lib/constants";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClinicaSaaS — Gestão de pacientes e faturamento para clínicas" },
      {
        name: "description",
        content:
          "Substitua suas planilhas. Controle de pacientes, atendimentos e faturamento (Pendente, CPF Inválido, Corrigido, Emitido) em um sistema rápido e seguro.",
      },
      { property: "og:title", content: "ClinicaSaaS — Gestão clínica e faturamento" },
      { property: "og:description", content: "SaaS B2B para clínicas: pacientes, atendimentos e faturamento." },
    ],
  }),
  component: LandingPage,
});

function contactLink() {
  const msg = "Olá, gostaria de conhecer o ClinicaSaaS para minha clínica.";
  return `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto h-16 px-6 flex items-center">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Stethoscope className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">ClinicaSaaS</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href={contactLink()} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm">Contato</Button>
            </a>
            <Link to="/login">
              <Button size="sm">Entrar</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              SaaS para clínicas
            </span>
            <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight">
              Gestão de pacientes e faturamento, sem planilha.
            </h1>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed">
              Cadastre pacientes, registre atendimentos e controle o status de
              faturamento (Pendente → CPF Inválido → Corrigido → Emitido) em um
              único lugar. Multi-equipe, com perfis de Admin, Contador e Recepção.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={contactLink()} target="_blank" rel="noreferrer">
                <Button size="lg" className="bg-[#25D366] hover:bg-[#1ebe57] text-white">
                  <MessageCircle className="h-5 w-5" />
                  Entrar em contato
                </Button>
              </a>
              <Link to="/login">
                <Button size="lg" variant="outline">Acessar minha conta</Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Acesso por convite. Sem cadastro público.
            </p>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-5">
          {[
            { icon: Users, title: "Pacientes em segundos", desc: "CRUD, busca e importação em massa via CSV." },
            { icon: FileCheck2, title: "Fluxo de faturamento", desc: "Acompanhe cada atendimento até a emissão da nota." },
            { icon: ShieldCheck, title: "Isolamento total", desc: "Cada clínica vê apenas seus próprios dados. LGPD-friendly." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-white p-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center text-xs text-slate-500">
          © {new Date().getFullYear()} ClinicaSaaS
        </div>
      </footer>
    </div>
  );
}
