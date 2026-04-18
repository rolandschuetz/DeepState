import SwiftUI

struct BootstrapView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("INeedABossAgent")
        .font(.headline)
      Text("UI shell bootstrapped. Bridge integration follows in the next task.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .padding(16)
    .frame(width: 320)
  }
}

#Preview {
  BootstrapView()
}
