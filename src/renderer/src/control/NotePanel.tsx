import type { JSX } from 'react'
import { TEXT_LIMITS } from '@shared/reducer'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import { Panel, TextArea } from '@renderer/ui'
import { blurOnEscape } from './leaveField'

/** Oturumun genel notu; yalnızca DM görür. */
export function NotePanel(): JSX.Element {
  const { generalNote } = useApp()

  return (
    <Panel className="ctl-panel ctl-note" title="Genel not">
      <TextArea
        className="ctl-note__input"
        value={generalNote}
        maxLength={TEXT_LIMITS.generalNote}
        rows={3}
        placeholder="Oturum notları (yalnızca sen görürsün)"
        aria-label="Genel not"
        onChange={(text) => dispatch({ type: 'note/setGeneral', text })}
        onKeyDown={blurOnEscape}
      />
    </Panel>
  )
}
