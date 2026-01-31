import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-4 sm:text-5xl md:text-6xl">
            OpenClaw Hackathon
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            A powerful agent platform with integrations and chat capabilities.
          </p>
          <Link href="/integrations">
            <Button size="lg" className="text-lg px-8 py-6">
              Get started
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
