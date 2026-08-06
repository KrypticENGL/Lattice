import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import Features from "@/components/landing/Features";
import CodeShowcase from "@/components/landing/CodeShowcase";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gruvbg text-gruvfg">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
        <CodeShowcase />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
