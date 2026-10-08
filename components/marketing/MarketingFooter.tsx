import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-top">
          <div className="foot-col">
            <h4>Capabilities</h4>
            <Link href="/#capabilities">Engineering</Link>
            <Link href="/#capabilities">AI &amp; Data</Link>
            <Link href="/#capabilities">Oracle Cloud</Link>
            <Link href="/#capabilities">Enterprise Transformation</Link>
            <Link href="/#capabilities">Managed Services</Link>
          </div>
          <div className="foot-col">
            <h4>Industries</h4>
            <Link href="/#industries">Financial Services</Link>
            <Link href="/#industries">Supply Chain</Link>
            <Link href="/#industries">Manufacturing</Link>
            <Link href="/#industries">Public Sector</Link>
            <Link href="/#industries">Retail</Link>
          </div>
          <div className="foot-col">
            <h4>Company</h4>
            <Link href="/about">Who we are</Link>
            <Link href="/#talent">Talent</Link>
            <Link href="/#insights">Insights</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/jobs">Jobs</Link>
          </div>
          <div className="foot-col">
            <h4>Support</h4>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Use</a>
            <a href="#">Cookie Policy</a>
            <a href="#">Accessibility</a>
            <a href="#">Site Map</a>
          </div>
          <div className="foot-contact">
            <div className="office">
              <h5>Headquarters</h5>
              <p>
                20130 Lakeview Center Plaza, Suite 400
                <br />
                Ashburn, VA 20147
              </p>
            </div>
            <div className="office">
              <h5>Branch Office</h5>
              <p>
                1101 Opal Court, Suite 211
                <br />
                Hagerstown, MD 21740
              </p>
            </div>
          </div>
        </div>
        <div className="foot-util">
          <div className="socials">
            <a
              href="https://www.linkedin.com/company/consult-america-inc"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.34 18.34V9.9H5.67v8.44zM7 8.73a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9.61v-4.63c0-2.47-1.32-3.62-3.08-3.62a2.66 2.66 0 0 0-2.41 1.33v-1.14h-2.67v8.44h2.67v-4.46c0-1.18.22-2.32 1.68-2.32 1.44 0 1.46 1.35 1.46 2.4v4.38z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/consult_america/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                aria-hidden
              >
                <rect x="2.5" y="2.5" width="19" height="19" rx="5.2" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a href="mailto:info@consultamerica.com" aria-label="Email">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden
              >
                <rect x="2" y="4.5" width="20" height="15" rx="2.5" />
                <path d="m3 6 9 6 9-6" />
              </svg>
            </a>
          </div>
          <div className="foot-util-right">
            <label className="region" aria-label="Region and language">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
              <select defaultValue="United States (English)">
                <option>United States (English)</option>
                <option>Canada (English)</option>
                <option>United Kingdom (English)</option>
                <option>Global (English)</option>
              </select>
              <svg className="caret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </label>
            <span className="foot-copy">© 2026 Consult America. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
