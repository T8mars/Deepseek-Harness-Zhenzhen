export const exampleTaskId = 'task_EXAMPLE_TEST_ONLY';
export function exampleTask(protocol, options = {}) {
  const id = options.id ?? exampleTaskId;
  const usage = { amount: 1.23456789, currency: 'CNY' };
  const media = 'https://media.example.com/EXAMPLE_RESULT.png?EXAMPLE_SIGNATURE=PRIVATE_TEST';
  const content = protocol === 'audio' ? { audio_url: media, audio_urls: [media, 'https://media.example.com/EXAMPLE_SECOND.mp3'] }
    : protocol === 'three-d' ? { file_url: 'https://media.example.com/EXAMPLE_MODEL.glb' }
    : protocol === 'legacy-video' ? { video_url: media } : { image_url: media, image_urls: [media, 'https://media.example.com/EXAMPLE_SECOND.png'] };
  const common = { task_id: id, status: 'SUCCESS', progress: '100%', usage, result_url: media,
    prompt: 'EXAMPLE_PRIVATE_PROMPT', quota: 123456, cost: 555, fail_reason: 'EXAMPLE_PRIVATE_FAILURE', data: { content } };
  if (protocol === 'video') return { id, status: 'completed', progress: 100, usage, metadata: { url: media }, ...options.record };
  if (protocol === 'midjourney') return { id, status: 'SUCCESS', progress: '100%', usage, imageUrl: media, buttons: [{ label: 'EXAMPLE_PRIVATE_BUTTON' }], cost: 555, ...options.record };
  if (protocol === 'minimax-v2') return { task: { id, status: 'succeeded', usage, content: { url: media }, ...options.record } };
  if (protocol === 'music') return { code: 200, data: { id, status: 'completed', progress: 100, usage, cost: 555, credits_cost: 123, result: { music: [{ title: 'EXAMPLE_PRIVATE_TITLE', lyrics: 'EXAMPLE_PRIVATE_LYRICS', audio_url: media }] }, ...options.record } };
  return { code: 'success', data: { ...common, ...options.record } };
}
