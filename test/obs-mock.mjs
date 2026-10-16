// OBS Studio simulado (protocolo obs-websocket 5) para las pruebas de Botonazo.
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const b64sha = (text) => crypto.createHash('sha256').update(text).digest('base64');

export function startObsMock({ port = 4466, password = 'secreto' } = {}) {
  const state = {
    scene: 'Principal',
    scenes: ['Principal', 'Pantalla', 'Pausa'],
    inputs: { 'Mic/Aux': false, 'Audio del escritorio': false },
    items: { Principal: { Cámara: { id: 7, enabled: true } }, Pantalla: { Cámara: { id: 9, enabled: false } } },
    stream: false, record: false, paused: false, vcam: false,
  };
  const calls = [];
  const wss = new WebSocketServer({ port });
  const clients = new Set();

  const emit = (eventType, eventData) => {
    for (const ws of clients) ws.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 0, eventData } }));
  };

  wss.on('connection', (ws) => {
    const salt = crypto.randomBytes(16).toString('base64');
    const challenge = crypto.randomBytes(16).toString('base64');
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1, authentication: { salt, challenge } } }));
    ws.on('message', (raw) => {
      const { op, d } = JSON.parse(String(raw));
      if (op === 1) {
        if (d.authentication !== b64sha(b64sha(password + salt) + challenge)) { ws.close(4009, 'auth'); return; }
        clients.add(ws);
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (op !== 6 || !clients.has(ws)) return;
      calls.push({ type: d.requestType, data: d.requestData });
      const ok = (responseData = {}) => ws.send(JSON.stringify({ op: 7, d: { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: true, code: 100 }, responseData } }));
      const fail = (code, comment) => ws.send(JSON.stringify({ op: 7, d: { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: false, code, comment } } }));
      const r = d.requestData || {};
      switch (d.requestType) {
        case 'GetVersion': return ok({ obsVersion: '31.0.0', obsWebSocketVersion: '5.5.0' });
        case 'GetSceneList': return ok({ currentProgramSceneName: state.scene, scenes: state.scenes.map((sceneName, i) => ({ sceneName, sceneIndex: state.scenes.length - 1 - i })) });
        case 'GetInputList': return ok({ inputs: Object.keys(state.inputs).map((inputName) => ({ inputName, inputKind: 'coreaudio_input_capture' })).concat([{ inputName: 'Cámara', inputKind: 'av_capture_input' }]) });
        case 'GetStreamStatus': return ok({ outputActive: state.stream, outputDuration: state.stream ? 65000 : 0 });
        case 'GetRecordStatus': return ok({ outputActive: state.record, outputPaused: state.paused, outputDuration: 0 });
        case 'GetVirtualCamStatus': return ok({ outputActive: state.vcam });
        case 'GetCurrentProgramScene': return ok({ currentProgramSceneName: state.scene, sceneName: state.scene });
        case 'SetCurrentProgramScene':
          if (!state.scenes.includes(r.sceneName)) return fail(600, `No source was found by the name of \`${r.sceneName}\`.`);
          state.scene = r.sceneName;
          ok();
          return emit('CurrentProgramSceneChanged', { sceneName: r.sceneName });
        case 'GetInputMute':
          if (!(r.inputName in state.inputs)) return fail(600, 'not found');
          return ok({ inputMuted: state.inputs[r.inputName] });
        case 'ToggleInputMute':
          if (!(r.inputName in state.inputs)) return fail(600, 'not found');
          state.inputs[r.inputName] = !state.inputs[r.inputName];
          ok({ inputMuted: state.inputs[r.inputName] });
          return emit('InputMuteStateChanged', { inputName: r.inputName, inputMuted: state.inputs[r.inputName] });
        case 'GetSceneItemId': {
          const item = state.items[r.sceneName]?.[r.sourceName];
          return item ? ok({ sceneItemId: item.id }) : fail(600, 'not found');
        }
        case 'GetSceneItemEnabled': {
          const item = Object.values(state.items[r.sceneName] || {}).find((i) => i.id === r.sceneItemId);
          return item ? ok({ sceneItemEnabled: item.enabled }) : fail(600, 'not found');
        }
        case 'SetSceneItemEnabled': {
          const item = Object.values(state.items[r.sceneName] || {}).find((i) => i.id === r.sceneItemId);
          if (!item) return fail(600, 'not found');
          item.enabled = r.sceneItemEnabled;
          ok();
          return emit('SceneItemEnableStateChanged', { sceneName: r.sceneName, sceneItemId: r.sceneItemId, sceneItemEnabled: item.enabled });
        }
        case 'ToggleStream':
          state.stream = !state.stream;
          ok({ outputActive: state.stream });
          return emit('StreamStateChanged', { outputActive: state.stream, outputState: state.stream ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
        case 'ToggleRecord':
          state.record = !state.record;
          state.paused = false;
          ok({ outputActive: state.record });
          return emit('RecordStateChanged', { outputActive: state.record, outputState: state.record ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
        case 'ToggleRecordPause':
          if (!state.record) return fail(501, 'Record is not active.');
          state.paused = !state.paused;
          ok();
          return emit('RecordStateChanged', { outputActive: true, outputState: state.paused ? 'OBS_WEBSOCKET_OUTPUT_PAUSED' : 'OBS_WEBSOCKET_OUTPUT_RESUMED' });
        case 'ToggleVirtualCam':
          state.vcam = !state.vcam;
          ok({ outputActive: state.vcam });
          return emit('VirtualcamStateChanged', { outputActive: state.vcam });
        case 'SaveReplayBuffer':
          return fail(501, 'Replay buffer is not active.');
        default:
          return fail(204, 'Unknown request type');
      }
    });
    ws.on('close', () => clients.delete(ws));
  });

  return { state, calls, close: () => new Promise((r) => { for (const ws of wss.clients) ws.terminate(); wss.close(r); }) };
}
