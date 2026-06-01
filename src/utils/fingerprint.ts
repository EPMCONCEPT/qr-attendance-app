/**
 * Hardware and environment fingerprinting to identify individual client devices 
 * and prevent students from sharing live QR screenshots.
 */
export function userAgentFingerprint(): string {
  if (typeof window === 'undefined') return 'EQR-NODE-SERVER';
  
  const nav = window.navigator;
  const screen = window.screen;
  
  const components = [
    nav.userAgent,
    nav.language || 'en-US',
    `${screen.width}x${screen.height}`,
    screen.colorDepth,
    new Date().getTimezoneOffset().toString()
  ];
  
  const rawString = components.join('|');
  
  // Custom rapid CRC/FNV hash to hex string
  let hash = 0;
  for (let i = 0; i < rawString.length; i++) {
    const char = rawString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `EQR-${Math.abs(hash).toString(16).toUpperCase()}-${Math.abs(hash % 10000)}`;
}
