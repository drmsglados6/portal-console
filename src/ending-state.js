const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function textUnits(value) {
  return segmenter ? [...segmenter.segment(value)].map((part) => part.segment) : [...value];
}

function prepareScene(scene) {
  if (scene.prepared) return scene;
  for (const event of scene.left) if (event.type === 'type') event.units = textUnits(event.text);
  for (const event of scene.credits) event.units = textUnits(event.text);
  scene.prepared = true;
  return scene;
}

function typedValue(event, time) {
  const progress = Math.max(0, Math.min(1, (time - event.at) / Math.max(1, event.durationMs)));
  return event.units.slice(0, Math.floor(event.units.length * progress)).join('');
}

function sceneState(scene, time) {
  let left = '';
  let leftTyping = false;
  for (const event of scene.left) {
    if (time < event.at) break;
    if (event.type === 'clear') {
      left = '';
      leftTyping = false;
    } else {
      left += typedValue(event, time);
      leftTyping = time < event.at + event.durationMs;
      if (leftTyping) break;
    }
  }

  const creditLines = [];
  let creditTyping = false;
  for (const event of scene.credits) {
    if (time < event.at) break;
    const complete = time >= event.at + event.durationMs;
    creditLines.push(complete ? event.text : typedValue(event, time));
    creditTyping = !complete;
    if (!complete) break;
  }

  let frame = '';
  for (const event of scene.art) {
    if (time < event.at) break;
    frame = event.frame;
  }
  return {
    left: left + (leftTyping ? '_' : ''),
    credits: creditLines.join('\n') + (creditTyping ? '_' : ''),
    frame
  };
}

module.exports = { prepareScene, sceneState };
