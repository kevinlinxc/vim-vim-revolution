import { GameProvider } from './game/GameProvider'
import GameContent from './game/GameContent'

export default function Page() {
  return (
    <GameProvider>
      <GameContent />
    </GameProvider>
  )
}
