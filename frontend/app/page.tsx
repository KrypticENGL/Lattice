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
    <div className="grain-bg relative flex h-full flex-col">
      <div className="shrink-0 px-3 pt-4 sm:px-6 sm:pt-6">
        <Navbar />
      </div>

      <div className="min-h-0 flex-1 px-3 pb-3 sm:px-6 sm:pb-6">
        <div className="h-full overflow-hidden rounded-[28px] border border-white/25">
          <div className="snap-container scrollbar-hide px-4 sm:px-10 lg:px-16">
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
    </div>
  );
}
