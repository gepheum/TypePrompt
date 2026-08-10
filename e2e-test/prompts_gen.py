class T_Meta:
 temperature: float
 foobar: T_Meta_Foobar


type T_Meta_Foobar = Literal[
 'foo',
 'bar',
]

