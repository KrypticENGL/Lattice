import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import Features from "@/components/landing/Features";
import CodeShowcase from "@/components/landing/CodeShowcase";
import Technologies from "@/components/landing/Technologies";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="relative h-full bg-[var(--bg-base)]">
      <Navbar />

      <div className="fixed inset-2.5 z-0 overflow-hidden rounded-[28px] border border-white/25 sm:inset-4">
        <div className="snap-container scrollbar-hide">
          <div className="snap-panel">
            <Hero />
          </div>
          <div className="snap-panel">
            <HowItWorks />
          </div>
          <div className="snap-panel">
            <Features />
          </div>
          <div className="snap-panel">
            <CodeShowcase />
          </div>
          <div className="snap-panel">
            <Technologies />
          </div>
          <div className="snap-panel flex flex-col">
            <div className="flex flex-1 items-center justify-center">
              <CTA />
            </div>
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
