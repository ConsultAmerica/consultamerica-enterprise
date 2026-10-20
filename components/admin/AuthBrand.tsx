import Link from "next/link";

/**
 * The company logo above the staff sign-in forms. Those pages carry no site
 * navigation, so this is the only brand on screen; it links home. Same mark,
 * wordmark and cache-buster as the marketing header.
 */
export function AuthBrand() {
  return (
    <Link href="/" className="brand adm-auth-brand" aria-label="Consult America home">
      <img className="mark" src="/logo-mark3.png?v=m1" alt="" aria-hidden />
      <span className="bt">
        <span className="bw">
          <b>Consult</b> <em>America</em>
        </span>
        <span className="btag">Building Innovative Future</span>
      </span>
    </Link>
  );
}
