## tooling notes

### PlantUML

PlantUML (`.puml` files; see [Reference Guide](http://pdf.plantuml.net/PlantUML_Language_Reference_Guide_en.pdf)) are used for sequence and class diagrams.

SVG files are generated and placed in the /img directory, e.g.

```
plantuml $FilePath$ -o "$FileDir$/../img" -tsvg
```
