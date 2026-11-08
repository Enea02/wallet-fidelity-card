# music/

Il brano del video (mp3, wav o m4a). Non versionato. Dopo averlo messo qui:

```sh
pnpm --filter @loyalty/motion beats music/brano.mp3            # beat 0 = primo beat rilevato
pnpm --filter @loyalty/motion beats music/brano.mp3 --offset 12.4  # il video parte dal beat più vicino a 12,4 s
```

Scegli il brano prima della beat sheet: è lui che decide durata e punti di taglio (drop, stacchi, build-up).
Annota in `beats.md` le battute dei momenti chiave del brano.
