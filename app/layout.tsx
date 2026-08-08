import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/layout/navigation";
import { Footer } from "@/components/layout/footer";
export const metadata: Metadata={metadataBase:new URL("https://handsonacademy.org.ng"),title:{default:"HandsOn Academy | Learn by building",template:"%s | HandsOn Academy"},description:"Project-based technology learning for people who want to build practical skills.",icons:{icon:'/icon.png',apple:'/icon.png'},openGraph:{type:"website",siteName:"HandsOn Academy"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><Navigation/><main id="main">{children}</main><Footer/></body></html>}
