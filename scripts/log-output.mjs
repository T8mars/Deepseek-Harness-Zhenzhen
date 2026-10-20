/** Never persist or echo the temporary browser-owner credential emitted by upstream. */
export function redactLauncherLine(text) {
  return text.replace(/([?&]token=)[^\s&#]+/g, '$1[redacted]')
    .replace(/(Authorization:\s*Bearer\s+)\S+/gi, '$1[redacted]');
}
